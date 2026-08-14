#!/usr/bin/env bash
#
# Build, verify and publish the signed Android driver app.
#
# It builds for either the direct static app or an optional managed operator,
# verifies the signature, names the file after build.gradle, and writes the
# checksum plus machine-readable release metadata. Nothing is advertised that
# is not actually there. Native preparation strips downloads from the WebView
# bundle so an older APK can never be packaged recursively inside its update.
#
# Needs web/android/keystore.properties and the keystore it names. Both are
# gitignored and per-operator: losing them means no driver can ever install
# an update over their current copy, because Android will not accept a build
# signed by a different key.
#
# Usage:
#   scripts/publish-driver-apk.sh direct https://ride.example.com
#   scripts/publish-driver-apk.sh https://your-operator.example.com
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="managed"
API_BASE=""
PUBLIC_APP_BASE=""
if [ "${1:-}" = "direct" ]; then
  MODE="direct"
  PUBLIC_APP_BASE="${2:-${VITE_PUBLIC_APP_BASE:-}}"
  if ! printf '%s' "$PUBLIC_APP_BASE" | grep -Eq '^https://[^/]+$|^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$'; then
    echo "usage: $0 direct <public-app-origin>" >&2
    echo "  example: $0 direct https://ride.example.com" >&2
    exit 2
  fi
else
  API_BASE="${1:-${VITE_API_BASE:-}}"
  if [ -z "$API_BASE" ]; then
    echo "usage: $0 <bootstrap-operator-base-url>" >&2
    exit 2
  fi
fi

ANDROID_DIR="$REPO_ROOT/web/android"
if [ "$MODE" = "direct" ]; then
  OUT_DIR="${DRIVER_APK_OUT_DIR:-$REPO_ROOT/web/public/downloads}"
else
  OUT_DIR="${DRIVER_APK_OUT_DIR:-$REPO_ROOT/public/downloads}"
fi

if [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "no web/android/keystore.properties — nothing to sign with." >&2
  echo "generate one with keytool, then record storeFile/storePassword/keyAlias/keyPassword." >&2
  exit 1
fi

if [ "$MODE" = "direct" ]; then
  ROUTING_URL="${VITE_PUBLIC_ROUTING_URL:-$PUBLIC_APP_BASE/routing}"
  RELAYS="${VITE_NOSTR_RELAYS:-wss://relay.damus.io,wss://nos.lol}"
  echo "==> building direct web bundle (routing: $ROUTING_URL)"
  ( cd "$REPO_ROOT/web" && \
    VITE_COORDINATION_MODE=direct \
    VITE_PUBLIC_ROUTING_URL="$ROUTING_URL" \
    VITE_NOSTR_RELAYS="$RELAYS" \
    npm run native:driver:android )
else
  WS_URL="${VITE_WS_URL:-$(printf '%s' "$API_BASE" | sed -e 's|^https://|wss://|' -e 's|^http://|ws://|')/ws}"
  echo "==> building managed web bundle with bootstrap $API_BASE (ws: $WS_URL)"
  ( cd "$REPO_ROOT/web" && \
    VITE_COORDINATION_MODE=managed \
    VITE_API_BASE="$API_BASE" \
    VITE_WS_URL="$WS_URL" \
    npm run native:driver:android )
fi

echo "==> assembling signed release"
( cd "$ANDROID_DIR" && ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}" ./gradlew assembleRelease --no-daemon -q )

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || { echo "no APK produced at $APK" >&2; exit 1; }

# An unsigned or debug-signed build must never reach the download page: it is
# the difference between an app a driver can install updates over and one they
# have to uninstall first, losing their history.
SIGNER="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$SIGNER" ]; then
  echo "apksigner not found — refusing to publish an unverified APK" >&2
  exit 1
fi
echo "==> verifying signature"
VERIFY_OUTPUT="$("$SIGNER" verify --verbose --print-certs "$APK")" || {
  echo "APK failed signature verification" >&2; exit 1; }
printf '%s\n' "$VERIFY_OUTPUT" | grep -E 'Verified using v2 scheme|certificate DN|SHA-256 digest'
printf '%s\n' "$VERIFY_OUTPUT" | grep -Eq '^Verified using v2 scheme.*: true$' || {
  echo "APK has no valid v2 signature — refusing to publish" >&2; exit 1; }
CERT_SHA256="$(printf '%s\n' "$VERIFY_OUTPUT" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1)"
printf '%s' "$CERT_SHA256" | grep -Eq '^[a-fA-F0-9]{64}$' || {
  echo "could not read signing certificate fingerprint" >&2; exit 1; }

VERSION="$(grep -oE 'versionName "[^"]+"' "$ANDROID_DIR/app/build.gradle" | head -1 | cut -d'"' -f2)"
VERSION="${VERSION:-unversioned}"
VERSION_CODE="$(grep -oE 'versionCode [0-9]+' "$ANDROID_DIR/app/build.gradle" | head -1 | awk '{print $2}')"
TARGET="$OUT_DIR/donkeyride-driver-${VERSION}.apk"
SOURCE_COMMIT="${SOURCE_COMMIT:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"

mkdir -p "$OUT_DIR"
cp "$APK" "$TARGET"
node "$REPO_ROOT/scripts/write-driver-release-metadata.mjs" \
  "$OUT_DIR" "$TARGET" "$VERSION" "$VERSION_CODE" "$CERT_SHA256" "$SOURCE_COMMIT" >/dev/null

echo
echo "published: $TARGET"
echo "     size: $(du -h "$TARGET" | cut -f1)"
echo "   sha256: $(cat "$TARGET.sha256")"
echo "      cert: $CERT_SHA256"
echo "    source: $SOURCE_COMMIT"
echo
echo "$OUT_DIR is gitignored — deploy it with the static release or operator."
