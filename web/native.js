// Playback from the macOS app (mac/main.swift), which calls `window.jizuraNative.update(state)`
// with each reading of the Spotify / Music app. Same interface as SpotifyPlayer.

/** A reading that disagrees with the running clock by less than this is jitter, not a seek. */
const RESYNC_MS = 120;

export const hasNative = () => !!window.webkit?.messageHandlers?.jizuraNative;

export class NativePlayer {
    constructor() {
        this._track = null;          // { trackId, title, artist, album, artUrl, durationMs }
        this._playing = false;
        this._anchorPos = 0;         // position (ms) at …
        this._anchorAt = 0;          // … this performance.now()
        this._seq = 0;               // last command sent; readings taken before it are stale
        this._lastError = null;
        this._onError = () => {};
        this._onRecover = () => {};
    }

    onError(cb) { this._onError = cb; }
    /** First good reading after an error. */
    onRecover(cb) { this._onRecover = cb; }

    start() {
        window.jizuraNative = { update: (s) => this._update(s) };
        this._post({ cmd: 'start' });
    }

    stop() { delete window.jizuraNative; }

    /** @returns {{trackId, title, artist, album, artUrl, durationMs, positionMs, paused} | null} */
    getState() {
        if (!this._track) return null;
        const pos = this._anchorPos + (this._playing ? performance.now() - this._anchorAt : 0);
        return { ...this._track, positionMs: Math.max(0, Math.min(pos, this._track.durationMs)), paused: !this._playing };
    }

    isPlaying() { return this._playing; }

    play() { this._post({ cmd: 'play' }); }
    pause() { this._post({ cmd: 'pause' }); }
    next() { this._post({ cmd: 'next' }); }
    previous() { this._post({ cmd: 'previous' }); }
    seek(ms) {
        ms = Math.max(0, Math.round(ms));
        // Move the local clock now so the lyrics jump with the slider; the next reading confirms.
        if (this._track) { this._anchorPos = ms; this._anchorAt = performance.now(); }
        this._post({ cmd: 'seek', ms });
    }

    _post(msg) {
        if (msg.cmd !== 'start') msg.seq = ++this._seq;
        window.webkit.messageHandlers.jizuraNative.postMessage(msg);
    }

    _update(s) {
        if (s.seq < this._seq) return;
        if (s.error) {
            // Nothing to follow, or not allowed to look. A failed read keeps the track: the retry
            // usually succeeds, and dropping it would blank the bar in between.
            if (s.error.kind === 'idle' || s.error.kind === 'permission') {
                this._track = null;
                this._playing = false;
            }
            // Errors repeat on every retry; report each condition once.
            if (s.error.message !== this._lastError) this._onError(s.error);
            this._lastError = s.error.message;
            return;
        }
        if (this._lastError) { this._lastError = null; this._onRecover(); }
        const now = performance.now();
        const sameTrack = this._track?.trackId === s.track.trackId;
        if (!sameTrack) this._track = s.track;
        const predicted = this._anchorPos + (this._playing ? now - this._anchorAt : 0);
        if (sameTrack && s.playing === this._playing && s.playing && Math.abs(predicted - s.positionMs) < RESYNC_MS) return;
        this._playing = s.playing;
        this._anchorPos = s.positionMs;
        this._anchorAt = now;
    }
}
