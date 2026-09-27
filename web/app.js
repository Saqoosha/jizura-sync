// jizura-sync: follow what the signed-in Spotify account is playing (on any device) and
// render it as a JIZURA lyric motion in real time.
//
// JIZURA's renderer is a pure function of time -- `frame(ctx, plan, t)` draws the instant `t`
// of a plan built once per song -- so syncing is just handing it the interpolated playback
// position every animation frame. Seeks, pauses and track skips need no extra state.

import { auth, SpotifyPlayer } from './spotify.js';
import { fetchLyrics, lrcToJizura } from './lyrics.js';

const J = window.J;

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const renderer = new J.Renderer();

// Characters JIZURA's HUD / title cards draw besides the lyrics (same set as its editor UI).
const HUD_CHARS = '0123456789:./-_()【】・No.LYRICRECUNTITLEDXYlinebpminterlude—─／ ';
const ASPECTS = ['16:9', '9:16', '4:3', '3:4', '1:1', '4:5', '21:9'];
// A song with no lyrics (yet) is a title card over one interlude cut. `[間奏]` is JIZURA's own
// lyric syntax for an instrumental break.
const NO_LYRICS = '[00:00.50][間奏]';

const OFFSET_KEY = 'jizura-sync.offsetMs';
const OFFSET_STEP_MS = 50;
// Frame stepping: JIZURA quantises motion to `koma` drawings per second (0 = every output
// frame) and its random look picks the value per mood. null = keep that pick.
const KOMA_KEY = 'jizura-sync.koma';
const KOMA_CYCLE = [null, 0, 12, 8];
// JIZURA's `unify`: per-part palettes of layouts / motions, repeated lines shown the same way,
// accent ("kime") lines. JIZURA defaults it off and its random look never sets it; without it
// every cut is an independent draw, which reads as random. On by default here.
const UNIFY_KEY = 'jizura-sync.unify';
// The now-playing bar is shown until the user clicks it away; the choice sticks.
const BAR_KEY = 'jizura-sync.barHidden';

let player = null;
let trackId = null;          // track the current plan belongs to
let song = null;             // { title, artist, durationMs, lyrics } for the current track
let look = null;             // JIZURA random look (omakase) applied on top of the default project
let plan = null;
let planAspect = null;       // JIZURA aspect key ('16:9' …) the plan was built for
let loadToken = 0;
let slow = false;
let offsetMs = Number(read(OFFSET_KEY)) || 0;
let komaPref = read(KOMA_KEY) === null ? null : Number(read(KOMA_KEY));
let unifyPref = read(UNIFY_KEY) !== '0';
let barHidden = read(BAR_KEY) === '1';

// ---------------------------------------------------------------- project / plan

function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return h >>> 0;
}

/** The supported JIZURA aspect closest to the window's, so the frame fills the screen. */
function windowAspect() {
    const r = window.innerWidth / Math.max(1, window.innerHeight);
    let best = ASPECTS[0], bd = Infinity;
    for (const a of ASPECTS) {
        const [w, h] = a.split(':').map(Number);
        const d = Math.abs(Math.log(r / (w / h)));
        if (d < bd) { bd = d; best = a; }
    }
    return best;
}

/** A fresh random look. Seeded by the track for the first roll, so a song always opens the same way. */
function rollLook(seed) {
    const rnd = seed == null ? Math.random : J.rng(seed);
    const base = Object.assign(J.defaultProject(), { extra: true, typo: true, kinetic: true });
    return J.omakase(base, rnd);
}

function buildPlan() {
    if (!song) { plan = null; return; }
    const project = Object.assign(J.defaultProject(), {
        extra: true, typo: true, kinetic: true, horror: false,
        title: song.title, artist: song.artist, lyrics: song.lyrics,
        aspect: (planAspect = windowAspect()), fps: 60,
    }, look);
    project.unify = unifyPref;
    if (komaPref !== null) project.fx = Object.assign({}, project.fx, { koma: komaPref, onTwos: komaPref > 0 });
    // LRC times are the whole timing: no BPM grid to snap to.
    project.timing = Object.assign({}, project.timing, { bpm: 0, snap: false });
    project.enabled = Object.assign({}, J.defaultProject().enabled, look.enabled);
    plan = J.plan(project, song.durationMs ? { duration: song.durationMs / 1000 } : null);
    sizeCanvas();
    J.ensureFonts(song.lyrics + song.title + song.artist + HUD_CHARS, J.fontsOfPlan(plan)).catch(() => {});
    setStatus(`${J.STYLES[project.style]?.name ?? project.style} · ${J.MOODS[project.mood]?.name ?? ''} · ${plan.cuts.length} cuts${project.unify ? ' · same style per section' : ''}`);
}

async function loadTrack(state) {
    const token = ++loadToken;
    trackId = state.trackId;
    $('track').textContent = `${state.title} — ${state.artist}`;
    $('art').hidden = !state.artUrl;
    if (state.artUrl) $('art').src = state.artUrl;
    look = rollLook(hashString(state.trackId));
    song = { title: state.title, artist: state.artist, durationMs: state.durationMs, lyrics: NO_LYRICS };
    buildPlan();
    setStatus('Looking up lyrics…');
    let lyr = null;
    try {
        lyr = await fetchLyrics({ artist: state.artist, title: state.title, album: state.album, durationMs: state.durationMs });
    } catch (err) {
        if (token !== loadToken) return;
        console.warn('lyrics', err);
        showError(`Lyrics lookup failed: ${err.message}`);
        return;
    }
    if (token !== loadToken) return;
    if (!lyr || !lyr.synced) {
        setStatus(lyr?.instrumental ? 'Instrumental' : lyr ? 'No synced lyrics for this track' : 'No lyrics found for this track');
        return;
    }
    const { lyrics, lines, parts } = lrcToJizura(lyr.synced);
    song = Object.assign({}, song, { lyrics });
    buildPlan();
    console.info(`[jizura-sync] ${state.title}: ${lines} lines in ${parts} parts`);
}

// ---------------------------------------------------------------- drawing

function sizeCanvas() {
    if (!plan) return;
    const ar = plan.W / plan.H;
    let cssW = window.innerWidth, cssH = cssW / ar;
    if (cssH > window.innerHeight) { cssH = window.innerHeight; cssW = cssH * ar; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(Math.min(plan.W, cssW * dpr)), ph = Math.round(pw / ar);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
}

function tick() {
    requestAnimationFrame(tick);
    const state = player?.getState();
    if (state && state.trackId && state.trackId !== trackId && state.durationMs > 0) loadTrack(state);
    if (state) lastError = null;
    updateBar(state);
    if (!plan || !state || state.trackId !== trackId) return;
    const t = Math.max(0, (state.positionMs + offsetMs) / 1000);
    const t0 = performance.now();
    renderer.frame(ctx, plan, Math.min(t, plan.duration - 1e-3), { scale: canvas.width / plan.W, fast: slow });
    // Same hysteresis as JIZURA's editor: drop blur filters while frames run long.
    const dt = performance.now() - t0;
    slow = dt > 30 ? true : dt < 14 ? false : slow;
}

// ---------------------------------------------------------------- Spotify

function startPlayer() {
    $('gate').hidden = true;
    $('disconnect').hidden = false;
    showBar();
    player = new SpotifyPlayer();
    player.onError((err) => {
        if (err.kind === 'not-registered') {
            showGate('This Spotify account is not on your app’s User Management list. Add it in the Spotify dashboard and reload — or sign out of Spotify and connect with the right account.');
            return;
        }
        if (err.kind === 'auth') { showGate(`${err.message}. Connect again.`); return; }
        showError(err.message);
    });
    player.start();
}

/** The gate is the only non-playing screen: set up the client ID, connect, or explain a failure. */
function showGate(text) {
    player?.stop();
    player = null;
    $('gateText').textContent = text;
    const configured = !!auth.clientId();
    $('setup').hidden = configured;
    $('connect').hidden = !configured;
    $('changeClient').hidden = !configured;
    $('bar').hidden = true;
    $('help').hidden = true;
    $('redirectUri').textContent = auth.redirectUri();
    $('clientId').value = auth.clientId() || '';
    $('gate').hidden = false;
}

$('setup').addEventListener('submit', (e) => {
    e.preventDefault();
    auth.setClientId($('clientId').value);
    showGate('Client ID saved. Connect to sign in with Spotify.');
});
$('connect').addEventListener('click', () => {
    auth.begin().catch((err) => showGate(`Could not start Spotify sign-in: ${err.message}`));
});
$('changeClient').addEventListener('click', () => {
    $('setup').hidden = false;
    $('connect').hidden = true;
    $('changeClient').hidden = true;
});
// Forgets this page's tokens. Spotify keeps its own session cookie, so signing in as another
// account also needs a sign-out at accounts.spotify.com.
$('disconnect').addEventListener('click', () => {
    auth.disconnect();
    $('help').hidden = true;
    trackId = null; song = null; plan = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showGate('Disconnected. Access can also be removed at spotify.com/account/apps.');
});

// ---------------------------------------------------------------- controls

function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key, value) {
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function setStatus(text) { $('status').textContent = text; wake(); }
function togglePlay() { if (player) (player.isPlaying() ? player.pause() : player.play()); }

// Errors also reach a user who hid the bar: a toast outside it, once per distinct message
// while nothing plays (a missing device reports every 3 s).
let lastError = null, toastTimer = 0;
function showError(text) {
    setStatus(text);
    if (!barHidden || $('bar').hidden || text === lastError) return;
    lastError = text;
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

function setOffset(ms) {
    offsetMs = ms;
    write(OFFSET_KEY, String(ms));
    setStatus(ms === 0 ? 'Lyrics timing reset' : `Lyrics ${Math.abs(ms)} ms ${ms > 0 ? 'earlier' : 'later'}`);
}
function toggleUnify() {
    unifyPref = !unifyPref;
    write(UNIFY_KEY, unifyPref ? '1' : '0');
    if (song) buildPlan();
    setStatus(unifyPref ? 'Same style within each song section' : 'Every line styled independently');
}
function cycleKoma() {
    komaPref = KOMA_CYCLE[(KOMA_CYCLE.indexOf(komaPref) + 1) % KOMA_CYCLE.length];
    write(KOMA_KEY, komaPref === null ? null : String(komaPref));
    if (song) buildPlan();
    setStatus(`Motion: ${komaPref === null ? 'as the look picks' : komaPref === 0 ? 'smooth' : `choppy, ${komaPref} fps`}`);
}
function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
}

/** One control, by its key name. Keys and the help window's buttons (no keyboard in a car) share it. */
function runKey(key) {
    switch (String(key).toLowerCase()) {
        case 'r':
            if (!song) return false;
            look = rollLook(null);
            buildPlan();
            break;
        case 'k': cycleKoma(); break;
        case 'u': toggleUnify(); break;
        case '[': setOffset(offsetMs - OFFSET_STEP_MS); break;
        case ']': setOffset(offsetMs + OFFSET_STEP_MS); break;
        case ' ': togglePlay(); break;
        case 'f': toggleFullscreen(); break;
        case 'h': toggleBar(); break;
        case '?': $('help').hidden = !$('help').hidden; break;
        case 'escape': $('help').hidden = true; break;
        default: return false;
    }
    wake();
    return true;
}

window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof HTMLInputElement && e.target.type !== 'range')) return;
    if (runKey(e.key) && e.key === ' ') e.preventDefault();
});
// A car's browser has a touchscreen and no keyboard, so there every key in the help becomes a
// button. Tesla's user agent ends in `Tesla/<version>`; `?tesla` does the same anywhere.
if (/\bTesla\//.test(navigator.userAgent) || new URLSearchParams(location.search).has('tesla')) {
    document.body.classList.add('tap-keys');
    $('help').querySelectorAll('kbd').forEach((kbd) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        kbd.replaceWith(b);
        b.append(kbd);
        // blur: a focused button would repeat on Enter / Space where a keyboard exists (?tesla).
        b.addEventListener('click', () => { b.blur(); runKey(kbd.textContent === 'Space' ? ' ' : kbd.textContent); });
    });
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Tap a key to use it.';
    $('help').querySelector('h2').after(hint);
}
window.addEventListener('dblclick', (e) => { if (!e.target.closest('#bar, #gate, #help')) toggleFullscreen(); });

let resizeTimer = 0;
window.addEventListener('resize', () => {
    sizeCanvas();
    // A different window shape may want a different JIZURA aspect, which is a new plan.
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (song && windowAspect() !== planAspect) buildPlan(); }, 300);
});

let idleTimer = 0;
function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
}
window.addEventListener('pointermove', wake);

// ---------------------------------------------------------------- now-playing bar

function fmtTime(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let seeking = false;         // the slider is being dragged: do not move it under the pointer
function updateBar(state) {
    if ($('bar').hidden) return;
    $('playPause').classList.toggle('play', !player?.isPlaying());
    if (!state) return;
    const elapsed = fmtTime(state.positionMs), total = fmtTime(state.durationMs);
    if ($('elapsed').textContent !== elapsed && !seeking) $('elapsed').textContent = elapsed;
    if ($('total').textContent !== total) $('total').textContent = total;
    if (!seeking) $('seek').value = String(Math.round(1000 * state.positionMs / Math.max(1, state.durationMs)));
}

function showBar() {
    $('bar').hidden = false;
    document.body.classList.toggle('bar-hidden', barHidden);
    $('bar').inert = barHidden;             // hidden controls must not take focus or keys
}
function toggleBar() {
    if ($('bar').hidden) return;
    barHidden = !barHidden;
    write(BAR_KEY, barHidden ? '1' : null);
    $('toast').hidden = true;
    lastError = null;
    document.body.classList.toggle('bar-hidden', barHidden);
    $('bar').inert = barHidden;
}

$('prev').addEventListener('click', () => player?.previous());
$('next').addEventListener('click', () => player?.next());
$('playPause').addEventListener('click', togglePlay);
$('fullscreen').addEventListener('click', toggleFullscreen);
$('helpButton').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
$('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').hidden = true; });
$('seek').addEventListener('input', () => {
    seeking = true;
    const st = player?.getState();
    if (st) $('elapsed').textContent = fmtTime(st.durationMs * $('seek').value / 1000);
});
$('seek').addEventListener('change', () => {
    seeking = false;
    const st = player?.getState();
    if (st) player.seek(st.durationMs * $('seek').value / 1000);
});
// `change` does not fire when a drag ends where it started or is cancelled.
for (const ev of ['pointerup', 'pointercancel', 'blur']) $('seek').addEventListener(ev, () => { seeking = false; });

// A click anywhere outside the bar toggles it. Delayed so that a double click (fullscreen)
// does not flash the bar off and on.
let clickTimer = 0;
window.addEventListener('click', (e) => {
    if (e.target.closest('#bar, #gate, #help, #toast')) return;
    clearTimeout(clickTimer);
    if (e.detail > 1) return;
    clickTimer = setTimeout(toggleBar, 250);
});

// ---------------------------------------------------------------- boot

/**
 * `?mock` (or `?mock=Artist|Title|durationMs`): no Spotify -- a fixed track on a local clock,
 * for trying the lyrics and rendering without an account. `?t=<seconds>` starts there.
 */
class MockPlayer {
    constructor(spec, startS) {
        const [artist, title, dur] = (spec || 'YOASOBI|夜に駆ける|261000').split('|');
        this.track = { trackId: `mock:${artist}:${title}`, artist, title, album: null, durationMs: Number(dur) || 261000 };
        this.base = startS * 1000;
        this.t0 = performance.now();
        this.paused = false;
    }
    getState() {
        const pos = this.paused ? this.base : this.base + performance.now() - this.t0;
        return { ...this.track, positionMs: pos % this.track.durationMs, paused: this.paused };
    }
    play() { if (this.paused) { this.t0 = performance.now(); this.paused = false; } }
    pause() { if (!this.paused) { this.base = this.getState().positionMs; this.paused = true; } }
    seek(ms) { this.base = ms; this.t0 = performance.now(); }
    isPlaying() { return !this.paused; }
    previous() { this.seek(0); }
    next() {}
    stop() {}
}

async function boot() {
    requestAnimationFrame(tick);
    wake();
    const q = new URLSearchParams(location.search);
    if (q.has('mock')) { player = new MockPlayer(q.get('mock'), Number(q.get('t')) || 0); showBar(); return; }
    try { await auth.handleRedirect(); } catch (err) { showGate(err.message); return; }
    if (!auth.clientId()) { showGate('Paste the Client ID of your own Spotify app to start.'); return; }
    if (!auth.isConnected()) { showGate("Lyric motion for what's playing on your Spotify"); return; }
    startPlayer();
}

// Read-only debug handle: `jizuraSync.plan` in devtools.
window.jizuraSync = { get plan() { return plan; }, get song() { return song; } };

boot();
