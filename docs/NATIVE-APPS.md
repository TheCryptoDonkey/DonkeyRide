# Native driver apps (Capacitor)

The **rider** app stays PWA-first: zero install friction is the point. The
**driver** app is wrapped natively, because a working shift needs background
location and a process that stays alive.

Both platforms wrap the same web build (`dist-native-driver`, the driver
entry point renamed to `index.html`) with appId `app.donkeyride.driver`.

```bash
cd web
VITE_API_BASE=https://<bootstrap-operator> VITE_WS_URL=wss://<bootstrap-operator>/ws \
  npm run native:driver:android     # or native:driver:ios
```

The URL is a bootstrap, not a permanent binding. A driver can open
Profile → Operator network, discover signed operator announcements, or enter
another compatible HTTPS backend directly. The selected operator and active
task origin persist on the device; changing operator does not require a new
APK. Rebuild only when you want to change the out-of-box bootstrap.

## What each platform actually does

| | Android | iOS |
|---|---|---|
| Background location on shift | Foreground service, persistent notification | `CLLocationManager` with the `location` background mode |
| Process stays alive mid-shift | Yes (foreground service) | Not guaranteed — iOS may suspend the WebView |
| Off-shift job alerts | UnifiedPush ([docs](ANDROID-PUSH.md)) | **None** |
| Store presence | Signed APK, direct download | Not submitted |

**The platforms are not equal, and the app should not pretend they are.** An
Android driver can close the app and still be offered work. An iOS driver is
reachable while on shift with the app running or backgrounded, and not
otherwise. Closing that gap needs APNs, which needs a paid Apple developer
account and a push service keyed to it — a decision, not an oversight.

## iOS specifics

- `web/ios/App/App/ShiftLocationPlugin.swift` is the app's own location
  plugin. `@capacitor-community/background-geolocation` is **excluded from
  the iOS build** (`ios.includePlugins: []` in `capacitor.config.ts`): at
  1.2.26 it does not compile against Capacitor 8 (it still calls
  `bridge.savedCall` and the pre-8 `getBool(_:)`) and it drags in Google Play
  Services on Android besides. Android keeps using it; iOS does not.
- The plugin registers as `ShiftLocation` with the same three methods the web
  app already calls, so `web/src/services/native-location.ts` only picks a
  name per platform.
- **Toolchain floor.** Capacitor 8 declares `CAPPluginCall.reject` inside
  `#if $NonescapableTypes` — a Swift 6.1 feature. On Xcode 16.2 (Swift 6.0.3)
  that member is invisible and any call to it fails to compile. The plugin
  therefore reports failures as a resolved `{error: {code, message}}` payload
  and the JS reads both shapes. On Xcode 16.3+ `fail()` can go back to
  `call.reject`.
- Info.plist carries the location usage strings, `NSMotionUsageDescription`
  and `UIBackgroundModes: [location]`. The strings say plainly what tracking
  happens and when it stops, because the driver is agreeing to be followed
  while they work.
- `showsBackgroundLocationIndicator` is deliberately ON: the blue status bar
  is the driver's own visible proof that a shift is tracking them.

### Building

```bash
cd web && npm run native:driver:ios
cd ios/App
xcodebuild -scheme App -sdk iphonesimulator -configuration Debug \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

A device build needs a signing team in Xcode (Signing & Capabilities →
select a team), which needs an Apple developer account.

### Status

The project builds clean for the simulator. It has **not** been run on an
iPhone: the location watcher, the background mode and the permission prompts
are unverified on hardware. Treat the iOS wrap as buildable, not shipped.

## Android specifics

See [ANDROID-PUSH.md](ANDROID-PUSH.md) for the UnifiedPush rail, and the
release keystore notes in the repo history. The release APK is distributed
from the operator itself (`/download.html`), never from git.
