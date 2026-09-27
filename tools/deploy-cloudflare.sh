#!/usr/bin/env bash
# Deploy web/ to your own Cloudflare account as a static-assets Worker, for a personal device
# where pasting a Client ID is impractical (a car browser, a TV).
#
#   SPOTIFY_CLIENT_ID=<32 hex> tools/deploy-cloudflare.sh [worker-name]
#
# The Client ID is written only into the staged copy of index.html, never into the repo: it seeds
# `jizura-sync.clientId` when the browser has none, so "Change Client ID" still works -- and a
# browser that already has an ID keeps it after a redeploy with another one. Register
# https://<worker-name>.<your-subdomain>.workers.dev/ as a Redirect URI on the Spotify app.
# This is for your own devices only -- see the README disclaimer.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:-jizura-sync}"
ID="${SPOTIFY_CLIENT_ID:-}"

[[ "$ID" =~ ^[0-9a-fA-F]{32}$ ]] || { echo "set SPOTIFY_CLIENT_ID to your app's 32-hex Client ID" >&2; exit 1; }
[[ -f "$ROOT/web/vendor/JIZURA/src/01_util.js" ]] || { echo "JIZURA submodule missing -- run: git submodule update --init" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/public/vendor/JIZURA"
# The page loads only JIZURA's src/*.js; the rest of the submodule is ~30 MB of editor and docs.
rsync -a --exclude vendor --exclude .DS_Store "$ROOT/web/" "$STAGE/public/"
rsync -a "$ROOT/web/vendor/JIZURA/src" "$ROOT/web/vendor/JIZURA/LICENSE" "$ROOT/web/vendor/JIZURA/THIRD_PARTY_NOTICES.md" "$STAGE/public/vendor/JIZURA/"

python3 - "$STAGE/public/index.html" "$ID" <<'EOF'
import sys
path, cid = sys.argv[1], sys.argv[2]
html = open(path, encoding='utf-8').read()
seed = ("<script>try{if(!localStorage.getItem('jizura-sync.clientId'))"
        f"localStorage.setItem('jizura-sync.clientId',JSON.stringify('{cid}'))}}catch(e){{}}</script>\n")
if html.count('</head>') != 1: sys.exit('index.html: expected one </head>')
open(path, 'w', encoding='utf-8').write(html.replace('</head>', seed + '</head>'))
EOF

cat > "$STAGE/wrangler.jsonc" <<EOF
{
  "name": "$NAME",
  "compatibility_date": "2026-09-01",
  "assets": { "directory": "./public" }
}
EOF

cd "$STAGE" && npx -y wrangler@latest deploy
