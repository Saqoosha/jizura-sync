#!/usr/bin/env bash
# Serve web/ on http://127.0.0.1:${PORT:-5180}/ -- register exactly that URL (with the trailing
# slash) as a Redirect URI on your Spotify app. Spotify accepts the loopback IP but not
# `localhost`, and http is allowed only for loopback addresses.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$ROOT/web/vendor/JIZURA/src/01_util.js" ]] || { echo "JIZURA submodule missing -- run: git submodule update --init" >&2; exit 1; }
cd "$ROOT/web"
exec python3 -m http.server "${PORT:-5180}" --bind 127.0.0.1
