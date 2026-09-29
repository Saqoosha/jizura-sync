#!/usr/bin/env bash
# Build the macOS app into build/jizura-sync.app (universal: Apple silicon and Intel).
#
#   tools/build-mac.sh                                   # ad-hoc signed, runs on this Mac
#   SIGN_IDENTITY="Developer ID Application: …" tools/build-mac.sh
#   SIGN_IDENTITY=… NOTARY_PROFILE=<notarytool keychain profile> tools/build-mac.sh
#
# With a Developer ID and a notary profile (`xcrun notarytool store-credentials`), the result is
# build/jizura-sync.zip of the notarized, stapled app, which opens on other Macs without a
# Gatekeeper warning.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build"
APP="$OUT/jizura-sync.app"
IDENTITY="${SIGN_IDENTITY:--}"

[[ -f "$ROOT/web/vendor/JIZURA/src/01_util.js" ]] || { echo "JIZURA submodule missing -- run: git submodule update --init" >&2; exit 1; }
for f in app.js spotify.js lyrics.js native.js; do node --input-type=module --check < "$ROOT/web/$f"; done

rm -rf "$APP" "$OUT/jizura-sync.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web/vendor/JIZURA" "$OUT/obj"

for arch in arm64 x86_64; do
    swiftc -O -swift-version 5 -target "$arch-apple-macos14.0" "$ROOT/mac/main.swift" -o "$OUT/obj/jizura-sync-$arch"
done
lipo -create "$OUT/obj/jizura-sync-arm64" "$OUT/obj/jizura-sync-x86_64" -output "$APP/Contents/MacOS/jizura-sync"
cp "$ROOT/mac/Info.plist" "$APP/Contents/Info.plist"

# App icon: every size iconutil expects, scaled from the 1024 px master.
ICONSET="$OUT/obj/AppIcon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
    sips -z $size $size "$ROOT/mac/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    sips -z $((size * 2)) $((size * 2)) "$ROOT/mac/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# Same selection as the Cloudflare deploy: the page loads only JIZURA's src/*.js.
rsync -a --exclude vendor --exclude .DS_Store "$ROOT/web/" "$APP/Contents/Resources/web/"
rsync -a "$ROOT/web/vendor/JIZURA/src" "$ROOT/web/vendor/JIZURA/LICENSE" "$ROOT/web/vendor/JIZURA/THIRD_PARTY_NOTICES.md" \
    "$APP/Contents/Resources/web/vendor/JIZURA/"

if [[ "$IDENTITY" == "-" ]]; then
    codesign --force --sign - --entitlements "$ROOT/mac/jizura-sync.entitlements" "$APP"
else
    codesign --force --sign "$IDENTITY" --options runtime --timestamp --entitlements "$ROOT/mac/jizura-sync.entitlements" "$APP"
fi
codesign --verify --strict "$APP"

if [[ -n "${NOTARY_PROFILE:-}" ]]; then
    [[ "$IDENTITY" != "-" ]] || { echo "NOTARY_PROFILE needs SIGN_IDENTITY (a Developer ID Application certificate)" >&2; exit 1; }
    ditto -c -k --keepParent "$APP" "$OUT/jizura-sync.zip"
    xcrun notarytool submit "$OUT/jizura-sync.zip" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$APP"
    rm "$OUT/jizura-sync.zip"
    ditto -c -k --keepParent "$APP" "$OUT/jizura-sync.zip"
    echo "Notarized: $OUT/jizura-sync.zip"
fi
echo "Built: $APP"
