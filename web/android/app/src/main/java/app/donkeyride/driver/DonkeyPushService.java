package app.donkeyride.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

import java.nio.charset.StandardCharsets;

/**
 * Off-shift job alerts over UnifiedPush.
 *
 * Web Push works in a browser; it does not work in an Android WebView, so
 * the native driver app would otherwise hear nothing once it is
 * backgrounded and the dispatch socket drops. UnifiedPush closes that gap
 * WITHOUT Firebase: the driver's own distributor app (ntfy, or any other)
 * carries the message, and the operator posts to it with the same RFC 8291
 * encryption and the same VAPID keys it already uses for browsers. Google
 * is not in the path and no Google account is required to run the app.
 *
 * The payload is decrypted on this device by the connector library. An
 * undecryptable message is dropped rather than shown: a job alert we
 * cannot read is a job alert we cannot honestly display, and the fallback
 * ("something happened, open the app") trains people to ignore alerts.
 */
public class DonkeyPushService extends PushService {

    private static final String TAG = "DonkeyPush";
    private static final String CHANNEL_ID = "jobs";
    private static final int NOTIFICATION_ID = 4711;

    @Override
    public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        if (endpoint.getPubKeySet() == null) {
            // A distributor without Web Push keys cannot receive an
            // encrypted payload. Refuse it rather than fall back to
            // plaintext job details travelling through a third party.
            Log.w(TAG, "Distributor returned an endpoint with no Web Push keys — ignoring");
            PushStore.clearEndpoint(this);
            UnifiedPushPlugin.notifySubscriptionChanged(this);
            return;
        }
        PushStore.saveEndpoint(
                this,
                endpoint.getUrl(),
                endpoint.getPubKeySet().getPubKey(),
                endpoint.getPubKeySet().getAuth()
        );
        // The WebView may be alive (driver just tapped Go online) or dead
        // (endpoint rotated overnight). Either way the subscription is
        // stored; this only shortcuts the live case.
        UnifiedPushPlugin.notifySubscriptionChanged(this);
    }

    @Override
    public void onMessage(PushMessage message, String instance) {
        if (!message.getDecrypted()) {
            Log.w(TAG, "Dropped an undecryptable push message");
            return;
        }
        String title = "DonkeyRide";
        String body = "Open the app for details";
        String url = "/provide";
        try {
            JSONObject payload = new JSONObject(new String(message.getContent(), StandardCharsets.UTF_8));
            title = payload.optString("title", title);
            body = payload.optString("body", body);
            url = payload.optString("url", url);
        } catch (Exception error) {
            Log.w(TAG, "Push payload was not the JSON we send — showing the default");
        }
        show(title, body, url);
    }

    @Override
    public void onRegistrationFailed(FailedReason reason, String instance) {
        Log.w(TAG, "UnifiedPush registration failed: " + reason);
        PushStore.clearEndpoint(this);
        UnifiedPushPlugin.notifySubscriptionChanged(this);
    }

    @Override
    public void onUnregistered(String instance) {
        PushStore.clearEndpoint(this);
        UnifiedPushPlugin.notifySubscriptionChanged(this);
    }

    private void show(String title, String body, String url) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Job alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("New jobs and updates while the app is closed");
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra(MainActivity.EXTRA_PUSH_URL, url);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(this, 0, intent, flags);

        // Stored as well as shown: a driver who taps the notification
        // after the process was killed still lands on the right screen.
        PushStore.setPendingUrl(this, url);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build();

        manager.notify(NOTIFICATION_ID, notification);
    }

    static Context appContext(Context context) {
        return context.getApplicationContext();
    }
}
