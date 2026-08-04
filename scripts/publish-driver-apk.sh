#!/usr/bin/env bash
#
# Build the signed Android driver app and publish it where the operator
# serves it from (public/downloads/).
#
# The operator's /api/driver-app reads that directory, so this script is the
# whole publishing step: build, verify the signature, name the file after the
# version in build.gradle, and write the checksum sidecar the download page
# shows. Nothing is advertised that is not actually there.
#
# Needs web/android/keystore.properties and the keystore it names. Both are
# gitignored and per-operator: losing them means no driver can ever install
# an update over their current copy, because Android will not accept a build
# signed by a different key.
#
# Usage:
#   scripts/publish-driver-apk.sh https://your-operator.example.com
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${1:-${VITE_API_BASE:-}}"

if [ -z "$API_BASE" ]; then
  echo "usage: $0 <operator-base-url>" >&2
  echo "  the API base is COMPILED IN — a wrapped app has no serving origin" >&2
  echo "  to infer it from, so a new URL means a new build." >&2
  exit 2
fi

WS_URL="${VITE_WS_URL:-$(printf '%s' "$API_BASE" | sed -e 's|^https://|wss://|' -e 's|^http://|ws://|')/ws}"
ANDROID_DIR="$REPO_ROOT/web/android"
OUT_DIR="$REPO_ROOT/public/downloads"

if [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "no web/android/keystore.properties — nothing to sign with." >&2
  echo "generate one with keytool, then record storeFile/storePassword/keyAlias/keyPassword." >&2
  exit 1
fi

echo "==> building web bundle for $API_BASE (ws: $WS_URL)"
( cd "$REPO_ROOT/web" && VITE_API_BASE="$API_BASE" VITE_WS_URL="$WS_URL" npm run native:driver:android )

echo "==> assembling signed release"
( cd "$ANDROID_DIR" && ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}" ./gradlew assembleRelease --no-daemon -q )

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || { echo "no APK produced at $APK" >&2; exit 1; }

# An unsigned or debug-signed build must never reach the download page: it is
# the difference between an app a driver can install updates over and one they
# have to uninstall first, losing their history.
SIGNER="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$SIGNER" ]; then
  echo "==> verifying signature"
  "$SIGNER" verify --print-certs "$APK" | grep -E 'certificate DN|SHA-256 digest' || {
    echo "APK failed signature verification" >&2; exit 1; }
else
  echo "!! apksigner not found — signature NOT verified" >&2
fi

VERSION="$(grep -oE 'versionName "[^"]+"' "$ANDROID_DIR/app/build.gradle" | head -1 | cut -d'"' -f2)"
VERSION="${VERSION:-unversioned}"
TARGET="$OUT_DIR/donkeyride-driver-${VERSION}.apk"

mkdir -p "$OUT_DIR"
# One published build at a time: a stale v0.9 sitting beside v1.0 is a
# download page offering whichever the operator happened to touch last.
rm -f "$OUT_DIR"/*.apk "$OUT_DIR"/*.apk.sha256
cp "$APK" "$TARGET"

if command -v shasum >/dev/null 2>&1; then
  ( cd "$OUT_DIR" && shasum -a 256 "$(basename "$TARGET")" | awk '{print $1}' > "$(basename "$TARGET").sha256" )
else
  ( cd "$OUT_DIR" && sha256sum "$(basename "$TARGET")" | awk '{print $1}' > "$(basename "$TARGET").sha256" )
fi

echo
echo "published: $TARGET"
echo "     size: $(du -h "$TARGET" | cut -f1)"
echo "   sha256: $(cat "$TARGET.sha256")"
echo
echo "public/downloads/ is gitignored — rsync it to the operator to serve it."
