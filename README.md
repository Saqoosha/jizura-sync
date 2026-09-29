# jizura-sync

A Mac app that turns the song playing in Spotify or the Music app into real-time lyric motion.

jizura-sync follows what Spotify or Music is playing on your Mac, fetches time-synced lyrics from [LRCLIB](https://lrclib.net), and renders them with [JIZURA](https://github.com/852wa/JIZURA), an engine that assembles lyric videos (文字PV) from hundreds of small layout, motion and decoration parts.

jizura-sync picks a look for each song automatically. Press the `R` key in its window to switch to a different one.

[日本語](README.ja.md)

> **A personal project, not a service.** The lyrics come from LRCLIB and are not licensed. Read the [disclaimer](#disclaimer) before sharing what you make with it.

## Install

jizura-sync is tested on macOS 27. It is built for macOS 14 and later, but versions before 27 have not been tried.

1. Download `jizura-sync-<version>.zip` from [Releases](https://github.com/Saqoosha/jizura-sync/releases) and unzip it.
2. Move **jizura-sync.app** to Applications and open it. Builds there are notarized, so macOS opens them without a warning.
3. Play a song in Spotify or the Music app. The first time jizura-sync reads one of them, macOS asks whether it may control that app; allow it. To change the answer later: System Settings → Privacy & Security → Automation.

jizura-sync checks for new versions itself; **jizura-sync → Check for Updates…** checks now.

## Using it

- It follows whichever of Spotify and the Music app is playing, and switches when you start the other one. It follows only playback on this Mac.
- Resize the window freely; when you let go, it snaps to the nearest shape JIZURA draws (16:9, 9:16, 4:3, 3:4, 1:1, 4:5, 21:9), keeping its size and the edges you did not drag, so the picture fills the window.
- Drag anywhere in the window to move it, except on the bar at the bottom.
- When a song shows no lyrics, the middle of the window says why: not found, not time-synced, instrumental, the lookup failed, or a stream (radio) with no song position to time them to.
- The display stays awake while a song plays in a visible window.
- The app is in Japanese when macOS is.

The bar at the bottom shows the cover art, the track, and play / pause, previous / next and seek for the player. Press `?` or the `?` button for these controls:

| Key | |
|---|---|
| Click, `H` | Hide / show the bar (remembered). Errors still appear briefly while it is hidden |
| `R` | Switch to a different look: style, mood, colours, fonts and the parts used |
| `U` | Same style within each song section (on, the default) or every line styled on its own (off) |
| `K` | Motion: as the look picks → smooth → choppy 12 fps → choppier 8 fps, like hand-drawn animation |
| `[` / `]` | Lyrics 50 ms later / earlier, when they run ahead of or behind the song (remembered) |
| `Space` | Play / pause |
| `F`, double-click | Fullscreen |
| `?`, `Esc` | Open / close the help |

## Limitations

- Lyrics are only as good as LRCLIB's community data. Some tracks have none, or only unsynced text, or none within a few seconds of the track's length; those show the title card and say why.
- Radio stations and live streams have no position within a song, so they get no lyrics.
- There is no beat sync. JIZURA can snap cuts to beats detected from audio, but jizura-sync cannot read the player's audio.
- Fonts load from Google Fonts on demand, so the first songs need a network connection to look right.

## Disclaimer

This project is a personal experiment. It is not affiliated with, endorsed by, or supported by Spotify, Apple, LRCLIB or the JIZURA author. It is provided as is, without warranty (see [LICENSE](LICENSE)). Whoever runs it is responsible for how they use it.

- **The lyrics are not licensed.** Lyrics are copyrighted works of their writers and publishers. LRCLIB's lyrics are contributed by its users, and neither LRCLIB nor this project has cleared them with the rights holders. This project holds no rights to any lyrics; it fetches them at runtime and does not store or redistribute them.
- **The app uses no music service API.** It reads the Spotify and Music apps on the same Mac over Apple Events. That does not license anything: the recordings are still Spotify's and Apple's to license.

## For developers

### Build from source

```bash
git clone --recursive https://github.com/Saqoosha/jizura-sync.git
cd jizura-sync
tools/build-mac.sh                    # build/jizura-sync.app, ad-hoc signed for this Mac
open build/jizura-sync.app
```

It needs the Xcode command line tools; there is no Xcode project. The first build downloads Sparkle into `build/`. Already cloned without `--recursive`? Run `git submodule update --init`.

### How it works

- **Playback.** The app reads Spotify's and Music's player state and position over Apple Events, addressed to each app's process so that a player you just quit is never relaunched. Both apps announce a track change, play and pause, and the app reads right away; neither announces a seek, so while a song plays it also reads once a second. Paused, idle or hidden, it sends nothing.
- **Lyrics.** Lyrics come from LRCLIB's synced LRC files, matched by artist, title and duration; a lookup that hits an LRCLIB outage is retried twice. LRC is close to JIZURA's own lyric format, so the conversion only escapes JIZURA's markup characters and marks song sections. A section starts at a blank line, a long pause, or a repeated block such as a chorus. Sections shorter than 3 lines are merged and sections longer than 8 lines are split, because the unify mode picks its parts per section.
- **Rendering.** The window is a web view running the page in `web/`. JIZURA builds a plan for the whole song once (cuts, parts, effects), and its renderer is a pure function of time. Each animation frame draws the plan at the current playback position, so seeking and pausing need no extra state, and a paused frame is not drawn again.

### Web page for Spotify

The same page also runs in a browser on its own, following Spotify playing on any device (phone, desktop, speaker) through the Spotify Web API. It is for people who can set up their own Spotify developer app: it needs a Spotify **Premium** account and a free developer app (Client ID), about five minutes of setup. It runs entirely in the browser, with no server of ours; the Spotify tokens and settings stay in the page's local storage and go only to Spotify.

1. Start the page:

   ```bash
   ./serve.sh            # http://127.0.0.1:5180/
   ```

2. Create a Spotify app:
   1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
   2. Fill in any name and description.
   3. Under **Redirect URIs**, add exactly `http://127.0.0.1:5180/`, including the trailing slash. Spotify accepts the loopback IP but rejects `localhost`.
   4. Under **Which API/SDKs are you planning to use?**, check **Web API**, then save.
   5. Open the app's **Settings** and copy the **Client ID**. It is a public identifier, not a secret; the sign-in uses PKCE, so there is no client secret anywhere.

3. Open <http://127.0.0.1:5180/>, paste the Client ID, then **Connect Spotify**. The setup screen shows the Redirect URI the page expects, so you can check it against your app. Play something on Spotify on any device and the lyrics follow it.

**Disconnect Spotify** at the bottom of the help forgets the tokens; [spotify.com/account/apps](https://www.spotify.com/account/apps/) revokes access completely. `?mock` plays a fixed song on a local clock with no Spotify at all; `?mock=Artist|Title|durationMs` picks another song, and `&t=30` starts 30 s in.

Spotify does not push player state to web apps, so the page polls `GET /me/player` once a second and extrapolates the position in between. Each reading is anchored at the midpoint of its request's round trip.

- **Other accounts.** A new Spotify app is in *development mode*: up to 5 Spotify accounts can use it, and each must be added under the app's **User Management**. An account that is not on the list gets `403` on every call; the page tells you when that happens.
- **Another port.** `PORT=8080 ./serve.sh`, then register `http://127.0.0.1:8080/` instead.
- **Your own hosting** (GitHub Pages or any static host): serve `web/`, including the submodule, and register the page's exact `https://` URL as a Redirect URI. The URI is the page address without query or hash, and the setup screen shows it.
- **A device without a keyboard** (a car's browser): `SPOTIFY_CLIENT_ID=<id> tools/deploy-cloudflare.sh` deploys `web/` to your own Cloudflare account with your Client ID filled in, so there is nothing to type. In Tesla's browser the keys in the help are tap buttons; `?tesla` shows them in any browser. Keep the deployment to your own devices.

### Terms for the web page

- **Spotify does not allow publishing an app like this.** Using the Web API makes you a Spotify developer, bound by the [Spotify Developer Terms](https://developer.spotify.com/terms) and [Developer Policy](https://developer.spotify.com/policy). Section III of the policy says: "Do not synchronize any sound recordings with any visual media, including any advertising, film, television program, slideshow, video, or similar content." Lyric motion timed to the playing track is that kind of synchronization. Whoever runs a copy of the web page creates their own Spotify app for it; the policy requires separate credentials for each app, so do not reuse another project's Client ID. That app can be used by at most 5 Spotify accounts in development mode, each registered on it, and those accounts share its Client ID.
- **Apple Music does not allow it either,** which is why the web page has no Apple Music version. The Apple Developer Program License Agreement says of MusicKit: "MusicKit Content cannot be synchronized with any other content, unless otherwise permitted by Apple in the Documentation." The Mac app does not use MusicKit.
- **Do not host the web page as a service for others.** Keep a deployment to yourself and the accounts registered on your own Spotify app.

### Updating JIZURA

```bash
git -C web/vendor/JIZURA fetch --depth 1 origin main
git -C web/vendor/JIZURA checkout FETCH_HEAD
tools/update-jizura-scripts.sh      # regenerates the <script> tags in web/index.html
```

The page loads JIZURA's `src/*.js` directly, in filename order, and skips `src/12_ui.js`, which is JIZURA's editor UI.

## Acknowledgements

All of the lyric motion is [JIZURA](https://github.com/852wa/JIZURA) by [852wa](https://github.com/852wa). This project only feeds it the playing track's position and lyrics. Every layout, motion, decoration and random look on screen is JIZURA's work, and it is published under the MIT license, which made this experiment possible. Thank you. You can try the original, with its editor and video export, at <https://852wa.github.io/JIZURA/>.

The app updates itself with [Sparkle](https://sparkle-project.org) (MIT).

## License

MIT, see [LICENSE](LICENSE). JIZURA is © 852wa, MIT licensed, and included as a submodule: see `web/vendor/JIZURA/LICENSE` and its `THIRD_PARTY_NOTICES.md`. Sparkle is © the Sparkle Project, MIT licensed, and bundled in the app. Lyrics are fetched at runtime from LRCLIB and are not part of this repository.
