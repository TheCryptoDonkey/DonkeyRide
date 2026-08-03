package app.donkeyride.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.unifiedpush.android.connector.UnifiedPush;

import java.lang.ref.WeakReference;
import java.util.List;

/**
 * Bridges the driver web app to UnifiedPush.
 *
 * The web app already knows how to keep a Web Push subscription in step
 * with the operator (subscribe on Go online, re-subscribe when working
 * areas change, unsubscribe on Go offline). This plugin hands it the same
 * shape of subscription from a completely different transport, so none of
 * that logic has to fork: {endpoint, keys:{p256dh, auth}} either way.
 *
 * Distributor choice belongs to the driver, not to us. If exactly one is
 * installed we use it; if several are, we return the list and let the app
 * ask. If none is installed there is nothing to fall back to — and we say
 * so rather than quietly pulling in Firebase.
 */
@CapacitorPlugin(
        name = "UnifiedPush",
        permissions = {
                @Permission(alias = UnifiedPushPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class UnifiedPushPlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";
    private static final String INSTANCE = "default";

    /** Weak so a dead WebView never keeps the plugin (and its activity) alive. */
    private static WeakReference<UnifiedPushPlugin> live = new WeakReference<>(null);

    @Override
    public void load() {
        live = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        live = new WeakReference<>(null);
    }

    /** Called from the push service when the endpoint appears, rotates or dies. */
    static void notifySubscriptionChanged(Context context) {
        UnifiedPushPlugin plugin = live.get();
        if (plugin == null) {
            // Nothing listening — the app reads the stored endpoint on next start.
            return;
        }
        plugin.notifyListeners("subscriptionChange", subscriptionOf(context));
    }

    private static JSObject subscriptionOf(Context context) {
        JSObject result = new JSObject();
        if (!PushStore.hasKeyedEndpoint(context)) {
            result.put("subscription", JSObject.NULL);
            return result;
        }
        JSObject keys = new JSObject();
        keys.put("p256dh", PushStore.p256dh(context));
        keys.put("auth", PushStore.auth(context));
        JSObject subscription = new JSObject();
        subscription.put("endpoint", PushStore.endpoint(context));
        subscription.put("keys", keys);
        result.put("subscription", subscription);
        return result;
    }

    /**
     * Which distributors this device can use, and which one is already
     * acknowledged. An empty list means the driver has no distributor app
     * installed (ntfy is the usual one).
     */
    @PluginMethod
    public void distributors(PluginCall call) {
        List<String> available = UnifiedPush.getDistributors(getContext());
        JSArray list = new JSArray();
        for (String distributor : available) {
            list.put(distributor);
        }
        JSObject result = new JSObject();
        result.put("distributors", list);
        String current = UnifiedPush.getAckDistributor(getContext());
        result.put("current", current == null ? JSObject.NULL : current);
        call.resolve(result);
    }

    /**
     * Register for push. Resolves immediately with what happened; the
     * endpoint itself arrives asynchronously from the distributor and is
     * delivered on the `subscriptionChange` listener.
     *
     * @param vapid the operator's VAPID public key (base64url, 87 chars) —
     *              the same one the browser path passes to pushManager.subscribe
     */
    @PluginMethod
    public void register(PluginCall call) {
        String vapid = call.getString("vapid");
        if (vapid == null || vapid.isEmpty()) {
            // Without VAPID the operator could not authenticate itself to
            // the push server, and anyone who learned the endpoint could
            // spray this device with fake jobs.
            call.reject("A VAPID public key is required");
            return;
        }

        String chosen = call.getString("distributor");
        if (chosen == null) {
            chosen = UnifiedPush.getAckDistributor(getContext());
        }
        if (chosen == null) {
            List<String> available = UnifiedPush.getDistributors(getContext());
            if (available.isEmpty()) {
                JSObject result = new JSObject();
                result.put("status", "no_distributor");
                call.resolve(result);
                return;
            }
            if (available.size() > 1) {
                JSArray list = new JSArray();
                for (String distributor : available) {
                    list.put(distributor);
                }
                JSObject result = new JSObject();
                result.put("status", "choose_distributor");
                result.put("distributors", list);
                call.resolve(result);
                return;
            }
            chosen = available.get(0);
        }

        UnifiedPush.saveDistributor(getContext(), chosen);
        try {
            UnifiedPush.register(getContext(), INSTANCE, "DonkeyRide Driver job alerts", vapid);
        } catch (Exception error) {
            call.reject("Registration failed: " + error.getMessage(), error);
            return;
        }

        JSObject result = new JSObject();
        result.put("status", "registering");
        result.put("distributor", chosen);
        call.resolve(result);
    }

    /** Going off shift. The distributor stops carrying messages for us. */
    @PluginMethod
    public void unregister(PluginCall call) {
        UnifiedPush.unregister(getContext(), INSTANCE);
        PushStore.clearEndpoint(getContext());
        call.resolve();
    }

    /** The stored subscription, if the distributor has given us one. */
    @PluginMethod
    public void getSubscription(PluginCall call) {
        call.resolve(subscriptionOf(getContext()));
    }

    /**
     * The in-app path of a notification the driver tapped, consumed once.
     * Covers the cold-start case, where the tap happened before any
     * JavaScript existed to hear about it.
     */
    @PluginMethod
    public void takePendingUrl(PluginCall call) {
        String url = PushStore.takePendingUrl(getContext());
        JSObject result = new JSObject();
        result.put("url", url == null ? JSObject.NULL : url);
        call.resolve(result);
    }

    /**
     * Android 13+ needs an explicit grant before anything can be shown.
     * Call it from the same tap that goes online, so the prompt has a
     * reason the driver can see.
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (getPermissionState(NOTIFICATIONS) == com.getcapacitor.PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(NOTIFICATIONS, call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(NOTIFICATIONS) == com.getcapacitor.PermissionState.GRANTED);
        call.resolve(result);
    }

    /** A notification tapped while the app was already running. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String url = intent == null ? null : intent.getStringExtra(MainActivity.EXTRA_PUSH_URL);
        if (url != null) {
            PushStore.setPendingUrl(getContext(), url);
            JSObject payload = new JSObject();
            payload.put("url", url);
            notifyListeners("notificationTapped", payload);
        }
    }
}
