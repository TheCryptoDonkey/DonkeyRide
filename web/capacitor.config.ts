import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for the DRIVER app. The rider app stays PWA-first (zero
 * install friction); the driver app goes native because background
 * location and store presence matter for a working shift.
 *
 * Build: VITE_API_BASE=https://<bootstrap-operator> VITE_WS_URL=wss://<bootstrap-operator>/ws \
 *          npm run native:driver:prepare && npx cap sync android
 *          (or `npx cap sync ios`)
 *
 * The two platforms are not equal, and pretending otherwise would mislead
 * a driver choosing a phone: Android gets off-shift job alerts over
 * UnifiedPush (see docs/ANDROID-PUSH.md), iOS has no equivalent rail and
 * would need APNs, which needs a paid Apple developer account and a
 * push server keyed to it. On iOS an ON-SHIFT driver is reachable through
 * background location plus the dispatch socket; an off-shift one is not.
 */
const config: CapacitorConfig = {
  appId: 'app.donkeyride.driver',
  appName: 'DonkeyRide Driver',
  webDir: 'dist-native-driver',
  android: {
    allowMixedContent: false,
  },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
    // No npm-installed native plugins on iOS. @capacitor-community/
    // background-geolocation does not compile against Capacitor 8 here
    // (pre-8 `bridge.savedCall` and `getBool(_:)`) and is unmaintained at
    // 1.2.26, so rather than patch someone else's plugin the App target
    // ships ShiftLocationPlugin.swift, which offers the same three
    // methods. Android keeps the community plugin and its foreground
    // service. Remove this line the day the plugin supports Capacitor 8.
    includePlugins: [],
  },
};

export default config;
