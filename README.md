# jizura-sync

Real-time lyric motion for what's playing on your Spotify — on any device.

jizura-sync follows your Spotify playback, fetches time-synced lyrics from [LRCLIB](https://lrclib.net), and renders them with [JIZURA](https://github.com/852wa/JIZURA), a browser engine that assembles lyric videos (文字PV) from hundreds of small layout, motion and decoration parts. Every song gets its own look; press `R` for another one.

[日本語](README.ja.md)

> **Not a public service, and it cannot be one.** Spotify's and Apple's developer terms both forbid synchronizing their music with visuals, which is exactly what this app does. The lyrics come from a community database and are not licensed. This repository is source code for personal experiments; read the [disclaimer](#disclaimer) before running or sharing it.

- Runs entirely in your browser. No server of ours: your Spotify tokens and settings stay in the page's local storage and go only to Spotify.
- Bring your own Spotify app (a free Client ID). The steps are below and take about five minutes.
- No build step. Static files plus the JIZURA engine as a git submodule.

## Setup

You need a Spotify **Premium** account: Spotify requires it of the owner of a development-mode app.

### 1. Get the code

```bash
git clone --recursive https://github.com/Saqoosha/jizura-sync.git
cd jizura-sync
./serve.sh            # http://127.0.0.1:5180/
```

Already cloned without `--recursive`? Run `git submodule update --init`.

### 2. Create a Spotify app

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
2. Fill in any name and description.
3. Under **Redirect URIs**, add exactly `http://127.0.0.1:5180/`, including the trailing slash. Spotify accepts the loopback IP but rejects `localhost`.
4. Under **Which API/SDKs are you planning to use?**, check **Web API**, then save.
5. Open the app's **Settings** and copy the **Client ID**.

The Client ID is a public identifier, not a secret. The sign-in uses PKCE, so there is no client secret anywhere.

### 3. Connect

Open <http://127.0.0.1:5180/>, paste the Client ID, then **Connect Spotify**. The setup screen shows the Redirect URI the page expects, so you can check it against your app.

Start playing something on Spotify on any device (phone, desktop, speaker). The lyrics follow it.

### Other people and other hosts

- **Other accounts.** A new Spotify app is in *development mode*: besides you, up to 5 Spotify accounts can use it, and each must be added under the app's **User Management**. An account that is not on the list gets `403` on every call; the page tells you when that happens.
- **Another port.** `PORT=8080 ./serve.sh`, then register `http://127.0.0.1:8080/` instead.
- **Your own hosting** (GitHub Pages or any static host): serve `web/`, including the submodule, and register the page's exact `https://` URL as a Redirect URI. The URI is the page address without query or hash, and the setup screen shows it.

## Controls

The bar at the bottom shows the cover art, the track, and play / pause, previous / next and seek on Spotify. Press `?` or the `?` button for the controls below.

| Key | |
|---|---|
| Click, `H` | Hide / show the bar (remembered). Errors still appear briefly while it is hidden |
| `R` | New random look: style, mood, colours, fonts and the parts used |
| `U` | Same style within each song section (on, the default) or every line styled on its own (off) |
| `K` | Motion: as the look picks → smooth → choppy 12 fps → choppier 8 fps, like hand-drawn animation |
| `[` / `]` | Lyrics 50 ms later / earlier, when they run ahead of or behind the song (remembered) |
| `Space` | Play / pause on Spotify |
| `F`, double-click | Fullscreen |
| `?`, `Esc` | Open / close the help |

**Disconnect Spotify** at the bottom of the help forgets the tokens. To revoke access completely, remove the app at [spotify.com/account/apps](https://www.spotify.com/account/apps/).

### Try it without Spotify

`http://127.0.0.1:5180/?mock` plays a fixed song on a local clock. `?mock=Artist|Title|durationMs` picks another song, and `&t=30` starts 30 s in.

## How it works

- **Playback.** Spotify does not push player state to web apps, so the page polls `GET /me/player` once a second and extrapolates the position in between. Each reading is anchored at the midpoint of its request's round trip.
- **Lyrics.** Lyrics come from LRCLIB's synced LRC files, matched by artist, title and duration. LRC is close to JIZURA's own lyric format, so the conversion only escapes JIZURA's markup characters and marks song sections. A section starts at a blank line, a long pause, or a repeated block such as a chorus. Sections shorter than 3 lines are merged and sections longer than 8 lines are split, because the unify mode picks its parts per section.
- **Rendering.** JIZURA builds a plan for the whole song once (cuts, parts, effects), and its renderer is a pure function of time. Each animation frame draws the plan at the current playback position, so seeking and pausing need no extra state.

## Limitations

- Lyrics are only as good as LRCLIB's community data. Some tracks have none, or only unsynced text; those show the title card instead.
- There is no beat sync. JIZURA can snap cuts to beats detected from audio, but a web app cannot read Spotify's audio.
- Fonts load from Google Fonts on demand.

## Disclaimer

This project is a personal experiment. It is not affiliated with, endorsed by, or supported by Spotify, Apple, LRCLIB or the JIZURA author. It is provided as is, without warranty (see [LICENSE](LICENSE)). Whoever runs it is responsible for how they use it.

- **Spotify does not allow publishing an app like this.** Using the Web API makes you a Spotify developer, bound by the [Spotify Developer Terms](https://developer.spotify.com/terms) and [Developer Policy](https://developer.spotify.com/policy). Section III of the policy says: "Do not synchronize any sound recordings with any visual media, including any advertising, film, television program, slideshow, video, or similar content." Lyric motion timed to the playing track is that kind of synchronization. Each person needs their own Spotify app (a Client ID is per app and must not be shared), and a development-mode app is limited to its owner plus 5 registered accounts.
- **Apple Music does not allow it either,** which is why there is no Apple Music version. The Apple Developer Program License Agreement says of MusicKit: "MusicKit Content cannot be synchronized with any other content, unless otherwise permitted by Apple in the Documentation."
- **The lyrics are not licensed.** Lyrics are copyrighted works of their writers and publishers. LRCLIB's lyrics are contributed by its users, and neither LRCLIB nor this project has cleared them with the rights holders. This project holds no rights to any lyrics; it fetches them at runtime and does not store or redistribute them.
- **Do not host it as a service for others.** Keep a deployment to yourself and the accounts registered on your own Spotify app.

## Updating JIZURA

```bash
git -C web/vendor/JIZURA fetch --depth 1 origin main
git -C web/vendor/JIZURA checkout FETCH_HEAD
tools/update-jizura-scripts.sh      # regenerates the <script> tags in web/index.html
```

The page loads JIZURA's `src/*.js` directly, in filename order, and skips `src/12_ui.js`, which is JIZURA's editor UI.

## Acknowledgements

All of the lyric motion is [JIZURA](https://github.com/852wa/JIZURA) by [852wa](https://github.com/852wa). This project only feeds it the playing track's position and lyrics. Every layout, motion, decoration and random look on screen is JIZURA's work, and it is published under the MIT license, which made this experiment possible. Thank you. You can try the original, with its editor and video export, at <https://852wa.github.io/JIZURA/>.

## License

MIT, see [LICENSE](LICENSE). JIZURA is © 852wa, MIT licensed, and included as a submodule: see `web/vendor/JIZURA/LICENSE` and its `THIRD_PARTY_NOTICES.md`. Lyrics are fetched at runtime from LRCLIB and are not part of this repository.
