# AGENTS.md

Usage and architecture are in README.md. This file holds what the code does not say.

- **`web/vendor/JIZURA` is upstream JIZURA as a submodule — never edit it.** The page loads its `src/*.js` directly as classic scripts (global `J`); `tools/update-jizura-scripts.sh` writes the `<script>` list into `web/index.html` between the `jizura:begin` / `jizura:end` markers, in byte order (`LC_ALL=C`, matching upstream's `sorted(glob)`), minus `12_ui.js`. Change what JIZURA does through the project / plan values `app.js` passes in, not by patching it.
- **JIZURA's renderer is a pure function of time.** Sync is `frame(ctx, plan, positionMs + offsetMs)` every animation frame; there is no sync state to keep.
- **JIZURA settings that matter here:** `unify` defaults off upstream and its random look (`J.omakase`) never sets it, which makes every cut an independent draw; it is on by default here (`U`). `fx.koma` (frame stepping) is chosen per mood by `omakase`; `K` overrides it.
- **Section breaks feed `unify`.** JIZURA ends a part at an empty lyric row or a `[間奏]` line; `lyrics.js` `partBreaks()` inserts empty rows from LRC blanks, long pauses and repeated blocks, then merges parts under 3 lines and splits parts over 8. It was tuned on LRCLIB data for four songs — re-check part sizes (`lines … in … parts` in the console) when changing it.
- **Spotify:** PKCE with a full-page redirect; storage keys `jizura-sync.clientId` / `jizura-sync.tokens` (localStorage) and `jizura-sync.pkce` (sessionStorage). The redirect URI is `origin + pathname`, which is why `index.html` moves `localhost` to `127.0.0.1` before anything loads. A development-mode app answers `403 … not registered` for accounts missing from its User Management list — terminal, polling stops.
- **LRCLIB** asks clients to identify themselves (`Lrclib-Client` header, allowed by its CORS preflight) and to honour `Retry-After` on 429.

## Checking changes

- `./serve.sh`, then `?mock` / `?mock=Artist|Title|durationMs&t=<s>` — no Spotify account involved. Never start or change anyone's Spotify playback from an agent.
- Count non-background pixels on the canvas before trusting a screenshot: two empty frames always compare equal.
- `window.jizuraSync.plan` / `.song` in devtools expose the current plan and lyric source.
