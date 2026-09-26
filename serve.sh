#!/usr/bin/env bash
# Serve web/ on http://127.0.0.1:${PORT:-5180}/ -- register exactly that URL (with the trailing
# slash) as a Redirect URI on your Spotify app. Spotify accepts the loopback IP but not
# `localhost`, and http is allowed only for loopback addresses.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$ROOT/web/vendor/JIZURA/src/01_util.js" ]] || { echo "JIZURA submodule missing -- run: git submodule update --init" >&2; exit 1; }
cd "$ROOT/web"
# http.server sends no Cache-Control, so browsers guess a lifetime from Last-Modified and keep
# running an old app.js after an edit. no-store makes every reload fetch the current files.
exec python3 - "${PORT:-5180}" <<'PY'
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1])
print(f'Serving web/ on http://127.0.0.1:{port}/', flush=True)
ThreadingHTTPServer(('127.0.0.1', port), NoStore).serve_forever()
PY
