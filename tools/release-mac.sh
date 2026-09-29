#!/usr/bin/env bash
# Publish a macOS release on GitHub, where the app's Sparkle updater looks for it.
#
#   SIGN_IDENTITY="Developer ID Application: …" NOTARY_PROFILE=<profile> tools/release-mac.sh 0.2.0
#
# The version must already be CFBundleShortVersionString in mac/Info.plist, committed. The build
# is notarized, then Sparkle's generate_appcast signs the zip with the EdDSA key in the login
# keychain (the one SUPublicEDKey in Info.plist matches) and writes appcast.xml. Both go to the
# GitHub release v<version>; SUFeedURL points at releases/latest/download/appcast.xml, so the
# newest release is the feed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build"
VERSION="${1:?usage: tools/release-mac.sh <version>}"
REPO="Saqoosha/jizura-sync"

[[ -n "${SIGN_IDENTITY:-}" && -n "${NOTARY_PROFILE:-}" ]] || { echo "set SIGN_IDENTITY and NOTARY_PROFILE: a release must be notarized" >&2; exit 1; }
PLIST_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$ROOT/mac/Info.plist")
[[ "$PLIST_VERSION" == "$VERSION" ]] || { echo "mac/Info.plist says $PLIST_VERSION, not $VERSION" >&2; exit 1; }
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "commit or stash your changes first" >&2; exit 1; }

"$ROOT/tools/build-mac.sh"
SPARKLE_VERSION=$(sed -n 's/^SPARKLE_VERSION=//p' "$ROOT/tools/build-mac.sh")

RELEASE="$OUT/release"
rm -rf "$RELEASE" && mkdir -p "$RELEASE"
cp "$OUT/jizura-sync.zip" "$RELEASE/jizura-sync-$VERSION.zip"
"$OUT/sparkle-$SPARKLE_VERSION/bin/generate_appcast" --download-url-prefix "https://github.com/$REPO/releases/download/v$VERSION/" \
    -o "$RELEASE/appcast.xml" "$RELEASE"

gh release create "v$VERSION" "$RELEASE/jizura-sync-$VERSION.zip" "$RELEASE/appcast.xml" \
    --repo "$REPO" --target "$(git -C "$ROOT" rev-parse HEAD)" --title "jizura-sync $VERSION" --generate-notes
