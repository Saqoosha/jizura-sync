// Spotify Web API: sign-in (Authorization Code with PKCE, no client secret) and a player that
// follows what the signed-in account is playing on any device.
//
// Everything is per browser: the client ID the user pasted, the tokens, and the PKCE verifier
// live in this origin's storage and are sent nowhere but accounts.spotify.com / api.spotify.com.

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state';

const CLIENT_ID_KEY = 'jizura-sync.clientId';
const TOKENS_KEY = 'jizura-sync.tokens';
const PKCE_KEY = 'jizura-sync.pkce';          // sessionStorage: only needs to survive one redirect

const store = {
    get(k, s = localStorage) { try { return JSON.parse(s.getItem(k)); } catch { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
    del(k, s = localStorage) { try { s.removeItem(k); } catch { /* storage blocked */ } },
};

export class SpotifyError extends Error {
    /** @param {'auth'|'not-registered'|'no-device'|'rate-limited'|'transient'|'command'} kind */
    constructor(kind, message) { super(message); this.kind = kind; }
}

// ---------------------------------------------------------------- auth

export const auth = {
    clientId: () => store.get(CLIENT_ID_KEY),
    setClientId(id) { store.set(CLIENT_ID_KEY, id.trim()); store.del(TOKENS_KEY); },

    /** The exact URI to register on the Spotify app: this page, without query or hash. */
    redirectUri: () => `${location.origin}${location.pathname}`,

    isConnected: () => !!store.get(TOKENS_KEY)?.refresh_token,

    /** Navigates away to Spotify's consent page. */
    async begin() {
        const verifier = randomString(64);
        const state = randomString(16);
        store.set(PKCE_KEY, { verifier, state }, sessionStorage);
        const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
        location.assign(`${ACCOUNTS}/authorize?${new URLSearchParams({
            response_type: 'code', client_id: auth.clientId(), scope: SCOPES,
            redirect_uri: auth.redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, state,
        })}`);
    },

    /** Completes sign-in when this page load is Spotify's redirect back. Returns true if it was. */
    async handleRedirect() {
        const q = new URLSearchParams(location.search);
        if (!q.has('code') && !q.has('error')) return false;
        history.replaceState(null, '', auth.redirectUri() + location.hash);
        const pkce = store.get(PKCE_KEY, sessionStorage);
        store.del(PKCE_KEY, sessionStorage);
        if (q.has('error')) throw new SpotifyError('auth', `Spotify sign-in was declined (${q.get('error')})`);
        if (!pkce || q.get('state') !== pkce.state) throw new SpotifyError('auth', 'Spotify sign-in did not match this tab — try again');
        await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: auth.redirectUri(), code_verifier: pkce.verifier });
        return true;
    },

    /** Forgets the tokens. Access can also be revoked at spotify.com/account/apps. */
    disconnect() { store.del(TOKENS_KEY); },
};

let refreshing = null;

async function tokenRequest(params) {
    const res = await fetch(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: auth.clientId(), ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        // 400 invalid_grant = the refresh token is dead (revoked, or the client ID changed): sign in again.
        if (res.status === 400) auth.disconnect();
        throw new SpotifyError(res.status === 400 ? 'auth' : 'transient', `Spotify token request failed: ${body.error_description || body.error || res.status}`);
    }
    const prev = store.get(TOKENS_KEY) || {};
    store.set(TOKENS_KEY, {
        access_token: body.access_token,
        refresh_token: body.refresh_token || prev.refresh_token,   // a refresh may not rotate it
        expires_at: Date.now() + body.expires_in * 1000,
    });
}

async function accessToken(force = false) {
    const t = store.get(TOKENS_KEY);
    if (!t?.refresh_token) throw new SpotifyError('auth', 'Not connected to Spotify');
    if (!force && t.access_token && t.expires_at - Date.now() > 60_000) return t.access_token;
    refreshing ||= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token }).finally(() => { refreshing = null; });
    await refreshing;
    return store.get(TOKENS_KEY).access_token;
}

/** One Web API call; a 401 refreshes the token and retries once. Throws SpotifyError. */
async function api(method, path, retried = false) {
    let res;
    try {
        res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${await accessToken()}` } });
    } catch (err) {
        if (err instanceof SpotifyError) throw err;
        throw new SpotifyError('transient', `Spotify unreachable (${err.message})`);
    }
    if (res.status === 401 && !retried) { await accessToken(true); return api(method, path, true); }
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    let message = text;
    try { message = JSON.parse(text).error?.message || text; } catch { /* plain text body */ }
    if (res.status === 401) throw new SpotifyError('auth', `Spotify rejected the session: ${message}`);
    // Development-mode apps answer 403 to every call from an account missing from the app's
    // User Management list; there is no point retrying that.
    if (res.status === 403 && /not registered/i.test(message)) {
        throw new SpotifyError('not-registered', 'This Spotify account is not on the app’s User Management list');
    }
    if (res.status === 429) throw new SpotifyError('rate-limited', 'Spotify rate limit — backing off');
    if (res.status >= 500) throw new SpotifyError('transient', `Spotify ${res.status}`);
    throw new SpotifyError('command', `Spotify ${res.status}: ${message}`);
}

// ---------------------------------------------------------------- player

const POLL_MS = 1000;
/** A poll that disagrees with the running clock by less than this is jitter, not a seek. */
const RESYNC_MS = 120;

/**
 * Follows the account's playback. Spotify does not push player state to web apps, so this
 * polls `GET /me/player` once a second and extrapolates the position in between. The anchor
 * of each reading is the midpoint of the request's round trip: `progress_ms` was sampled
 * somewhere during it, and the midpoint halves the worst-case error. (The response's own
 * `timestamp` field is when the playback state last *changed*, not when it was read.)
 */
export class SpotifyPlayer {
    constructor() {
        this._track = null;          // { trackId, title, artist, album, artUrl, durationMs }
        this._paused = true;
        this._anchorPos = 0;         // position (ms) at …
        this._anchorAt = 0;          // … this performance.now()
        this._timer = null;
        this._seekAt = 0;            // polls sent before the last seek carry the old position
        this._failures = 0;
        this._running = false;
        this._onError = () => {};
        this._onVisible = () => { if (document.visibilityState === 'visible') this._schedule(0); };
    }

    onError(cb) { this._onError = cb; }

    start() {
        if (this._running) return;
        this._running = true;
        document.addEventListener('visibilitychange', this._onVisible);
        this._schedule(0);
    }

    stop() {
        this._running = false;
        clearTimeout(this._timer);
        document.removeEventListener('visibilitychange', this._onVisible);
    }

    /** @returns {{trackId, title, artist, album, artUrl, durationMs, positionMs, paused} | null} */
    getState() {
        if (!this._track) return null;
        const pos = this._anchorPos + (this._paused ? 0 : performance.now() - this._anchorAt);
        return { ...this._track, positionMs: Math.max(0, Math.min(pos, this._track.durationMs)), paused: this._paused };
    }

    play() { this._command('PUT', '/me/player/play'); }
    pause() { this._command('PUT', '/me/player/pause'); }
    next() { this._command('POST', '/me/player/next'); }
    previous() { this._command('POST', '/me/player/previous'); }
    seek(ms) {
        ms = Math.max(0, Math.round(ms));
        // Move the local clock now so the lyrics jump with the slider; the next poll confirms.
        if (this._track) { this._anchorPos = ms; this._anchorAt = this._seekAt = performance.now(); }
        this._command('PUT', `/me/player/seek?position_ms=${ms}`);
    }

    async _command(method, path) {
        try {
            await api(method, path);
            this._schedule(250);          // pick up the new state quickly
        } catch (err) {
            this._schedule(0);            // resync whatever the command left behind locally
            this._onError(err instanceof SpotifyError ? err : new SpotifyError('command', err.message));
        }
    }

    _schedule(ms) {
        clearTimeout(this._timer);
        if (this._running) this._timer = setTimeout(() => this._poll(), ms);
    }

    async _poll() {
        const t0 = performance.now();
        let res;
        try {
            res = await api('GET', '/me/player?additional_types=track');
        } catch (err) {
            if (!this._running) return;
            this._onError(err);
            if (err.kind === 'not-registered' || err.kind === 'auth') { this.stop(); return; }
            this._failures++;
            this._schedule(Math.min(30_000, 1000 * 2 ** this._failures));   // 2, 4, 8, 16, 30 s
            return;
        }
        const t1 = performance.now();
        if (!this._running) return;
        this._failures = 0;
        if (res.status === 204) {                            // no active device
            this._track = null;
            this._onError(new SpotifyError('no-device', 'Nothing is playing on Spotify'));
            this._schedule(POLL_MS * 3);
            return;
        }
        const s = await res.json();
        const item = s.item;
        if (item && item.type === 'track' && t0 >= this._seekAt) this._read(s, item, (t0 + t1) / 2);
        // Poll right after the current track should end so the next song starts without a lag.
        let next = POLL_MS;
        const st = this.getState();
        if (st && !st.paused) next = Math.max(200, Math.min(POLL_MS, st.durationMs - st.positionMs + 150));
        this._schedule(next);
    }

    _read(s, item, at) {
        const trackId = item.id || item.uri;
        const sameTrack = this._track?.trackId === trackId;
        const paused = !s.is_playing;
        if (!sameTrack) {
            this._track = {
                trackId,
                title: item.name,
                artist: item.artists.map((a) => a.name).join(', '),
                album: item.album?.name || null,
                // Images are sorted largest first; the smallest one at least 128 px is plenty for a thumbnail.
                artUrl: (item.album?.images || []).filter((i) => !i.width || i.width >= 128).at(-1)?.url
                    || item.album?.images?.[0]?.url || null,
                durationMs: item.duration_ms,
            };
        }
        const predicted = this._anchorPos + (this._paused ? 0 : at - this._anchorAt);
        if (sameTrack && paused === this._paused && !paused && Math.abs(predicted - s.progress_ms) < RESYNC_MS) return;
        this._paused = paused;
        this._anchorPos = s.progress_ms;
        this._anchorAt = at;
    }
}

// ---------------------------------------------------------------- helpers

function randomString(n) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return base64url(bytes).slice(0, n);
}

function base64url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
