# Publishing DonkeyRide Driver to Zapstore

[Zapstore](https://zapstore.dev) is the Nostr-native app store: apps are
announced as signed Nostr events, users verify the publisher key and the
APK certificate rather than trusting a corporate store. That fits
DonkeyRide exactly — same trust model as the rest of the stack.

## One-time setup (decisions that are permanent)

1. **Choose the publisher key.** The Nostr key that signs the first
   publish is the app's identity on Zapstore forever — updates must be
   signed by the same key or installs will not update. Recommendation: a
   dedicated publisher key for forgesworn apps (NOT a personal key, NOT
   the demo operator key), generated offline and stored with the Android
   keystore backups (`~/Documents/KeystoreBackups/donkeyride/`).
2. **Certificate linkage.** On first publish the APK signing certificate
   (SHA-256 `61ca13847eddb053bc25907780a066a672947b7700f96137a6470989930e4dfc`)
   is linked to the publisher's Nostr identity (NIP-C1). Keep the
   Android keystore and the publisher nsec together — losing either
   strands existing installs.
3. **Repository visibility.** Zapstore's relay verifies `zapstore.yaml`
   in the repository against the publishing pubkey before whitelisting.
   That requires the GitHub repo to be public (currently it is private —
   a pending decision).

## Publishing a release

```bash
# Install the publisher CLI (Go)
go install github.com/zapstore/zsp@latest

# Build the signed release APK first (see keystore backup README):
cd web && npm run native:driver:prepare && npx cap sync android
cd android && ./gradlew assembleRelease

# From the repo root, publish. SIGN_WITH takes an nsec, a hex key, or a
# NIP-46 bunker URL (use a bunker in CI so the key never touches disk).
cd ../..
SIGN_WITH=<publisher-nsec-or-bunker-url> zsp publish
```

`zsp publish --wizard` walks through the same flow interactively the
first time and fills in `zapstore.yaml`.

## Updating

Bump `versionCode`/`versionName` in `web/android/app/build.gradle`,
rebuild `assembleRelease`, run the same `zsp publish` with the SAME key.
Also refresh the copy served from the operator
(`public/downloads/` on the demo box + the `.sha256` beside it) so the
direct-download path stays current.
