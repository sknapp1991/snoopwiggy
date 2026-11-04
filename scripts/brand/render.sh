#!/usr/bin/env bash
# Render the VersesAcross icon and link-preview image to PNG with headless Chrome (re-run after editing
# scripts/brand/*.svg|html). Outputs are committed: src/app/{icon.svg,apple-icon.png,favicon.ico,
# opengraph-image.png,twitter-image.png} and public/icon-{192,512,maskable-512}.png.
set -e
cd "$(dirname "$0")"
BRAND="$(pwd -W 2>/dev/null || pwd)"
ROOT="../.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PROFILE="$(mktemp -d)"
shot() { # file width height out
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --user-data-dir="$PROFILE" \
    --window-size="$2,$3" --screenshot="$4" "file:///$BRAND/$1" >/dev/null 2>&1
}
shot og.html 1200 630 "$BRAND/og.png"
shot icon-page.html 512 512 "$BRAND/icon-512.png"
# Chrome won't make windows narrower than ~500px, so smaller sizes are scaled down from 512.
for s in 192 180 48 32; do ffmpeg -y -loglevel error -i icon-512.png -vf "scale=$s:$s:flags=lanczos" "icon-$s.png"; done
mv icon-180.png apple-180.png
shot maskable.html 512 512 "$BRAND/maskable-512.png"
cp icon.svg "$ROOT/src/app/icon.svg"
cp og.png "$ROOT/src/app/opengraph-image.png"
cp og.png "$ROOT/src/app/twitter-image.png"
cp apple-180.png "$ROOT/src/app/apple-icon.png"
cp icon-512.png "$ROOT/public/icon-512.png"
cp icon-192.png "$ROOT/public/icon-192.png"
cp maskable-512.png "$ROOT/public/icon-maskable-512.png"
python make-ico.py "$ROOT/src/app/favicon.ico" icon-32.png icon-48.png
rm -f og.png icon-512.png icon-192.png apple-180.png icon-48.png icon-32.png maskable-512.png
rm -rf "$PROFILE"
echo "rendered"
