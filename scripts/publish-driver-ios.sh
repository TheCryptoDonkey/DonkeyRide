#!/usr/bin/env bash
#
# Build the iOS driver app and upload it to TestFlight.
#
# The counterpart of publish-driver-apk.sh. Where Android is signed with a
# keystore the operator holds, iOS is signed with an Apple developer account,
# so the inputs are credentials rather than a file:
#
#   APPLE_TEAM_ID   10-character team identifier (Apple Developer → Membership)
#   ASC_KEY_ID      App Store Connect API key ID
#   ASC_ISSUER_ID   the issuer UUID shown above the key list
#   ASC_KEY_PATH    path to the AuthKey_<KEYID>.p8 file
#
# The API key must have the App Manager role to upload builds. Keep the .p8
# outside this repo — it is the equivalent of the Android keystore, and Apple
# lets you download it exactly once.
#
# Usage:
#   APPLE_TEAM_ID=ABCDE12345 \
#   ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
#   ASC_KEY_PATH=~/private_keys/AuthKey_XXXXXXXXXX.p8 \
#     scripts/publish-driver-ios.sh https://ride.trotters.dev
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${1:-${VITE_API_BASE:-}}"

fail() { echo "$*" >&2; exit 1; }

[ -n "$API_BASE" ] || fail "usage: $0 <operator-base-url>
  The API base is COMPILED IN — a wrapped app has no serving origin to infer
  it from, so a new operator URL means a new build."

[ -n "${APPLE_TEAM_ID:-}" ] || fail "APPLE_TEAM_ID is not set (Apple Developer → Membership)."
[ -n "${ASC_KEY_ID:-}" ]    || fail "ASC_KEY_ID is not set (App Store Connect → Users and Access → Integrations)."
[ -n "${ASC_ISSUER_ID:-}" ] || fail "ASC_ISSUER_ID is not set."
[ -n "${ASC_KEY_PATH:-}" ]  || fail "ASC_KEY_PATH is not set (path to AuthKey_*.p8)."
KEY_PATH="${ASC_KEY_PATH/#\~/$HOME}"
[ -f "$KEY_PATH" ] || fail "no API key file at $KEY_PATH"

WS_URL="${VITE_WS_URL:-$(printf '%s' "$API_BASE" | sed -e 's|^https://|wss://|' -e 's|^http://|ws://|')/ws}"
IOS_DIR="$REPO_ROOT/web/ios"
APP_DIR="$IOS_DIR/App"
BUILD_DIR="$REPO_ROOT/web/ios/build"
ARCHIVE="$BUILD_DIR/App.xcarchive"

echo "==> building web bundle for $API_BASE (ws: $WS_URL)"
( cd "$REPO_ROOT/web" && VITE_API_BASE="$API_BASE" VITE_WS_URL="$WS_URL" npm run native:driver:ios )

# TestFlight refuses a build number it has already seen for this version, and
# there is no way to delete one. Derive it from the commit count so it always
# climbs and always maps back to a revision.
BUILD_NUMBER="$(cd "$REPO_ROOT" && git rev-list --count HEAD)"
echo "==> build number $BUILD_NUMBER (git rev-list --count HEAD)"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> archiving"
xcodebuild archive \
  -project "$APP_DIR/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGN_STYLE=Automatic \
  | grep -E '^(\*\*|error:|warning: .*(sign|provision|privacy))' || true

[ -d "$ARCHIVE" ] || fail "no archive produced — see the xcodebuild output above"

# The manifest is only worth anything if it is actually inside the bundle.
# A .xcprivacy that is not in Copy Bundle Resources silently does nothing and
# Apple emails about ITMS-91053 a few minutes after upload instead.
if [ ! -f "$ARCHIVE/Products/Applications/App.app/PrivacyInfo.xcprivacy" ]; then
  fail "PrivacyInfo.xcprivacy is missing from the built app — check it is in the target's Copy Bundle Resources phase"
fi
echo "==> privacy manifest present in the bundle"

echo "==> exporting and uploading to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$IOS_DIR/ExportOptions.plist" \
  -exportPath "$BUILD_DIR/export" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID"

echo
echo "uploaded. App Store Connect processes the build for a few minutes before"
echo "it appears in TestFlight."
echo
echo "Version $(grep -m1 'MARKETING_VERSION' "$APP_DIR/App.xcodeproj/project.pbxproj" | sed 's/.*= //;s/;//') build $BUILD_NUMBER"
