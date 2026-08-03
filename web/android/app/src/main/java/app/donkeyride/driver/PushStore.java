package app.donkeyride.driver;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * The device's current UnifiedPush registration, kept where both the
 * background service and the WebView can reach it.
 *
 * The endpoint URL is device-addressing PII, exactly as it is on the
 * operator side — it stays in the app's private preferences, is never
 * logged, and is cleared on unregister.
 */
final class PushStore {

    private static final String PREFS = "donkeyride.push";
    private static final String KEY_ENDPOINT = "endpoint";
    private static final String KEY_P256DH = "p256dh";
    private static final String KEY_AUTH = "auth";
    /** A notification tapped while the WebView was dead — replayed on next start. */
    private static final String KEY_PENDING_URL = "pendingUrl";

    private PushStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveEndpoint(Context context, String endpoint, String p256dh, String auth) {
        prefs(context).edit()
                .putString(KEY_ENDPOINT, endpoint)
                .putString(KEY_P256DH, p256dh)
                .putString(KEY_AUTH, auth)
                .apply();
    }

    static void clearEndpoint(Context context) {
        prefs(context).edit()
                .remove(KEY_ENDPOINT)
                .remove(KEY_P256DH)
                .remove(KEY_AUTH)
                .apply();
    }

    static String endpoint(Context context) {
        return prefs(context).getString(KEY_ENDPOINT, null);
    }

    static String p256dh(Context context) {
        return prefs(context).getString(KEY_P256DH, null);
    }

    static String auth(Context context) {
        return prefs(context).getString(KEY_AUTH, null);
    }

    /**
     * A registration is only usable if the distributor gave us Web Push
     * keys. Without them the operator cannot encrypt to this device, and
     * an unencrypted job alert is not something we are willing to send.
     */
    static boolean hasKeyedEndpoint(Context context) {
        return endpoint(context) != null && p256dh(context) != null && auth(context) != null;
    }

    static void setPendingUrl(Context context, String url) {
        prefs(context).edit().putString(KEY_PENDING_URL, url).apply();
    }

    static String takePendingUrl(Context context) {
        String url = prefs(context).getString(KEY_PENDING_URL, null);
        if (url != null) {
            prefs(context).edit().remove(KEY_PENDING_URL).apply();
        }
        return url;
    }
}
