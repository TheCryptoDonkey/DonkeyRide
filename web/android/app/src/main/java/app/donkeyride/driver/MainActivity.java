package app.donkeyride.driver;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Path a tapped job notification wants the app to open. */
    public static final String EXTRA_PUSH_URL = "app.donkeyride.driver.PUSH_URL";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super so the bridge picks it up on first load.
        registerPlugin(UnifiedPushPlugin.class);
        super.onCreate(savedInstanceState);

        // Cold start from a notification tap: the plugin hands this to the
        // web app once JavaScript is running.
        String url = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_PUSH_URL);
        if (url != null) {
            PushStore.setPendingUrl(this, url);
        }
    }
}
