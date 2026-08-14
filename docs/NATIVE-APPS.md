# Native driver apps (Capacitor)

The **rider** app stays PWA-first: zero install friction is the point. The
**driver** app is wrapped natively, because a working shift needs background
location and a process that stays alive.

Both platforms wrap the same web build (`dist-native-driver`, the driver
entry point renamed to `index.html`) with appId `app.donkeyride.driver`.

```bash
# Direct Android release for a static PWA
scripts/publish-driver-apk.sh direct https://ride.example.com

# Optional operator-bound Android release
scripts/publish-driver-apk.sh https://operator.example.com
```

The direct build has no DonkeyRide API or operator subscription. Its routing
URL must be absolute because a Capacitor WebView has no public web origin. A
managed URL is only a bootstrap: a driver can explicitly switch network from
Profile, and changing a selected operator does not require a new APK.

## What each platform actually does

| | Android | iOS |
|---|---|---|
| Background location on shift | Foreground service, persistent notification | `CLLocationManager` with the `location` background mode |
| Process stays alive mid-shift | Yes (foreground service) | Not guaranteed — iOS may suspend the WebView |
| Off-shift job alerts | Managed mode only: UnifiedPush ([docs](ANDROID-PUSH.md)) | **None** |
| Store presence | Signed APK, direct download | Not submitted |

**The platforms are not equal, and the app should not pretend they are.** An
Android direct mode stays reachable while **Go Online** remains active because
the foreground service keeps its WebView and Nostr subscription alive. Going
offline or force-stopping the app ends that shift; direct mode has no off-shift
push. A managed Android build can additionally use UnifiedPush. An iOS driver
is reachable while on shift with the app running or backgrounded, and not
otherwise. Closing that gap needs APNs, a paid Apple developer account and a
push service keyed to it — a decision, not an oversight.

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

See [ANDROID-PUSH.md](ANDROID-PUSH.md) for the optional managed-mode
UnifiedPush rail. Releases are distributed from `/download.html`, never from
git. The static page reads `/downloads/driver-app.json`; that metadata contains
the exact APK byte count, SHA-256, signing-certificate fingerprint and source
commit. A missing file must return 404 rather than falling back to HTML.
