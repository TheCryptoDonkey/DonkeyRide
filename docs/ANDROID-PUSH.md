# Job alerts in the Android driver app (UnifiedPush)

The browser gets Web Push. The Android WebView does not implement the Push
API at all, so the wrapped driver app would go silent the moment it is
backgrounded and the dispatch WebSocket drops. UnifiedPush closes that gap
**without Firebase**: the driver's own distributor app carries the message,
and what it hands back is an ordinary Web Push subscription.

```
operator (web-push, VAPID)  →  driver's distributor (ntfy, …)  →  DonkeyRide Driver
        RFC 8291 encrypted             carries the ciphertext          decrypts, shows
```

**Nothing on the operator changes.** `POST /api/push/subscribe` receives the
same `{endpoint, keys:{p256dh, auth}}` it already receives from browsers,
`src/push.js` encrypts the same way with the same VAPID keys, and the
endpoint is still treated as device PII (in memory, never persisted, never
relayed).

## Why this rail

- No Google account, no Play Services, no Firebase project. The app runs on
  a de-Googled phone.
- The payload is end-to-end encrypted to the device (RFC 8291). The
  distributor relays ciphertext it cannot read, exactly as Google's push
  service does for the browser.
- The driver chooses who carries their notifications, and can self-host it.

## What was built

| Piece | Where |
|-------|-------|
| Push service (decrypt, notify, store endpoint) | `web/android/app/src/main/java/app/donkeyride/driver/DonkeyPushService.java` |
| Capacitor plugin (register, subscription, permission, taps) | `.../UnifiedPushPlugin.java` |
| Endpoint storage | `.../PushStore.java` |
| Plugin registration + cold-start tap | `.../MainActivity.java` |
| TypeScript bridge | `web/src/services/unified-push.ts` |
| Transport branch (browser vs native) | `web/src/services/push.ts` |
| "No distributor installed" notice | `web/src/pages/provider/DashboardPage.tsx` |
| Connector dependency (`3.3.3`) | `web/android/variables.gradle`, `web/android/app/build.gradle` |

`dispatch.ts` is untouched: it still calls `enableJobPush` on Go online and
`disableJobPush` on Go offline, and the branch happens inside `push.ts`.

## Deliberate refusals

- **No plaintext fallback.** A distributor that returns an endpoint without
  Web Push keys is rejected, and an undecryptable message is dropped rather
  than shown as "something happened, open the app". A job alert we cannot
  read is one we cannot honestly display.
- **No Firebase fallback.** If the driver has no distributor installed, the
  dashboard says so and links to ntfy. Silently pulling in Google's
  transport would defeat the point of the rail.
- **No silent failure.** `getPushState()` drives a dashboard notice, because
  a driver reads silence as "no jobs tonight" rather than "your alerts are
  broken".

## Testing it on a device

Requires a real phone; the emulator has no distributor.

1. Install a distributor — [ntfy](https://f-droid.org/packages/io.heckel.ntfy/)
   from F-Droid is the usual one. Open it once so it registers itself.
2. Build and install the driver app:
   ```bash
   cd web
   VITE_API_BASE=https://<operator> VITE_WS_URL=wss://<operator>/ws \
     npm run native:driver:prepare
   npx cap sync android
   cd android && ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
3. Tap **Go online**. Grant notifications when asked. The dashboard should
   show no push warning; ntfy should show a new subscription.
4. Confirm the operator has the endpoint:
   ```bash
   adb logcat -s DonkeyPush   # endpoint arriving from the distributor
   ```
5. Background the app (Home, screen off) and create a ride request nearby
   from the rider app. The notification should arrive and open the incoming
   job screen on tap.
6. Tap **Go offline** and check that a subsequent request produces nothing.

### Status

Everything above compiles and the APK assembles, but the flow has **not**
been exercised on real hardware yet — steps 3 to 6 are the outstanding
verification. Until then, treat native push as unproven; the foreground
WebSocket and the background-location foreground service are what keep an
on-shift driver reachable today.

## Notes

- Android 13+ requires the `POST_NOTIFICATIONS` runtime grant. The plugin
  requests it on the Go online tap, so the prompt has a visible reason.
- Distributors may rotate an endpoint at any time. `push.ts` listens for
  that and re-registers with the operator, preserving the driver's working
  areas — a rotation must not quietly change where their jobs come from.
- The `<queries>` element in the manifest is required on Android 11+.
  Without it the connector cannot see an installed distributor and the app
  reports "none" while ntfy is sitting on the home screen.
- iOS has no UnifiedPush equivalent; an iOS wrap would need APNs, which is a
  separate decision.
