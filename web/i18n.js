// UI text in English or Japanese, following the browser's (or the macOS app's) language. Keys are
// the English text; `{name}` is filled from `vars`. A key missing from JA shows in English.

const JA = {
    // gate / Spotify sign-in (web page)
    "Lyric motion for what's playing on your Spotify": 'Spotify で再生中の曲を歌詞モーションに',
    'Paste the Client ID of your own Spotify app to start.': 'はじめに、自分の Spotify アプリの Client ID を貼り付けてください。',
    'Client ID saved. Connect to sign in with Spotify.': 'Client ID を保存しました。接続して Spotify にサインインしてください。',
    'Could not start Spotify sign-in: {detail}': 'Spotify のサインインを開始できませんでした: {detail}',
    'Disconnected. Access can also be removed at spotify.com/account/apps.': '切断しました。アクセス権は spotify.com/account/apps でも取り消せます。',
    '{detail}. Connect again.': '{detail}。もう一度接続してください。',
    'This Spotify account is not on your app’s User Management list. Add it in the Spotify dashboard and reload — or sign out of Spotify and connect with the right account.':
        'この Spotify アカウントは、アプリの User Management に登録されていません。Spotify のダッシュボードで追加して再読み込みするか、Spotify からサインアウトして正しいアカウントで接続してください。',
    'Spotify sign-in was declined ({detail})': 'Spotify のサインインが拒否されました（{detail}）',
    'Spotify sign-in did not match this tab — try again': 'Spotify のサインインがこのタブと一致しません。もう一度お試しください',
    'Spotify token request failed: {detail}': 'Spotify のトークンを取得できませんでした: {detail}',
    'Not connected to Spotify': 'Spotify に接続していません',
    'Spotify unreachable ({detail})': 'Spotify に接続できません（{detail}）',
    'Spotify rejected the session: {detail}': 'Spotify がセッションを拒否しました: {detail}',
    'This Spotify account is not on the app’s User Management list': 'この Spotify アカウントは、アプリの User Management に登録されていません',
    'Spotify rate limit — backing off': 'Spotify のレート制限中です。間隔をあけて再試行します',
    'Nothing is playing on Spotify': 'Spotify で何も再生していません',

    // playback from the macOS app
    'Music': 'ミュージックApp',
    'Open Spotify or Music and play a song': 'Spotify かミュージックApp で曲を再生してください',
    'Nothing is playing in {apps}': '{apps}で何も再生していません',
    ' or ': 'と',
    'Allow jizura-sync to control {app} in System Settings → Privacy & Security → Automation':
        'システム設定 →「プライバシーとセキュリティ」→「オートメーション」で、jizura-sync に{app}の操作を許可してください',
    'Could not read {app}: {detail}': '{app}を読み取れませんでした: {detail}',
    'Could not read the current track from {app}': '{app}の再生中の曲を読み取れませんでした',

    // lyrics and look
    'Looking up lyrics…': '歌詞を検索しています…',
    'Lyrics lookup failed: {detail}': '歌詞を検索できませんでした: {detail}',
    'No lyrics: lookup failed ({detail})': '歌詞なし: 検索に失敗しました（{detail}）',
    'Instrumental': 'インストゥルメンタル',
    'No synced lyrics for this track': 'この曲にはタイミング付きの歌詞がありません',
    'No lyrics: a stream has no song position to time them to': '歌詞なし: ストリームには曲の中の再生位置がないため、タイミングを合わせられません',
    'No lyrics found for this track': 'この曲の歌詞が見つかりません',
    '{n} cuts': '{n} カット',
    'same style per section': 'セクションごとに同じスタイル',
    'Lyrics timing reset': '歌詞のタイミングをリセットしました',
    'Lyrics {ms} ms earlier': '歌詞を {ms} ms 早くしました',
    'Lyrics {ms} ms later': '歌詞を {ms} ms 遅くしました',
    'Same style within each song section': 'セクションごとに同じスタイル',
    'Every line styled independently': '行ごとに別のスタイル',
    'Motion: as the look picks': 'モーション: ルックに合わせる',
    'Motion: smooth': 'モーション: なめらか',
    'Motion: choppy, {fps} fps': 'モーション: コマ打ち {fps} fps',
    'Tap a key to use it.': 'キーをタップすると使えます。',

    // index.html
    'Spotify Client ID': 'Spotify Client ID',
    '32 hex characters': '16 進数 32 文字',
    'Register this exact Redirect URI on your Spotify app:': 'Spotify アプリに、この Redirect URI をそのまま登録してください:',
    'Save': '保存',
    'How to get a Client ID': 'Client ID の取り方',
    'Connect Spotify': 'Spotify に接続',
    'Change Client ID': 'Client ID を変更',
    'Previous track': '前の曲',
    'Play/pause': '再生 / 一時停止',
    'Next track': '次の曲',
    'Seek': 'シーク',
    'Keyboard shortcuts': 'キーボードショートカット',
    'Fullscreen': 'フルスクリーン',
    'Controls': '操作',
    'Click': 'クリック',
    'Disconnect Spotify': 'Spotify から切断',
    'help.bar': 'バーを隠す / 表示する（<kbd>H</kbd> でも）',
    'help.r': '新しいランダムなルック: スタイル、ムード、色、フォント、使うパーツ',
    'help.u': 'セクションごとに同じスタイル（オン）/ 行ごとに別のスタイル（オフ）',
    'help.k': 'モーション: ルックに合わせる → なめらか → コマ打ち 12 fps → 8 fps（手描きアニメ風）',
    'help.offset': '歌詞が曲より早い / 遅いときに、50 ms 遅く / 早く',
    'help.space': '再生 / 一時停止',
    'help.f': 'フルスクリーン（ダブルクリックでも）',
    'help.help': 'このヘルプ',
};

export const lang = /^ja\b/i.test(navigator.languages?.[0] || navigator.language || '') ? 'ja' : 'en';

export function t(key, vars = {}) {
    const text = (lang === 'ja' && JA[key]) || key;
    return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/**
 * Translates index.html in place: `data-i18n` (text, the English text is the key),
 * `data-i18n-html` (a key whose Japanese entry keeps markup such as <kbd>; the dictionary is
 * static), `data-i18n-aria` and `data-i18n-placeholder`.
 */
export function localizePage() {
    document.documentElement.lang = lang;
    if (lang !== 'ja') return;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.textContent.trim());
    for (const el of document.querySelectorAll('[data-i18n-html]')) if (JA[el.dataset.i18nHtml]) el.innerHTML = JA[el.dataset.i18nHtml];
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.getAttribute('aria-label')));
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.placeholder);
}
