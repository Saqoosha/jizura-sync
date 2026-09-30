# jizura-sync

Spotify やミュージックApp で再生中の曲を、リアルタイムに歌詞モーションにする Mac アプリ。

Mac の Spotify かミュージックApp で再生中の曲を追い、同期歌詞を [LRCLIB](https://lrclib.net) から取って、[JIZURA](https://github.com/852wa/JIZURA) で描く。JIZURA は、数百の小さな部品（レイアウト・動き・装飾）を組み合わせて文字PVを組み立てるエンジン。

見た目は jizura-sync が曲ごとに自動で選ぶ。jizura-sync のウィンドウで `R` キーを押すと、別の見た目に変わる。

[English](README.md)

> **個人のプロジェクトで、サービスではない**。歌詞は LRCLIB から取っていて、許諾を得ていない。これで作ったものを共有する前に、[免責事項](#免責事項)を読むこと。

## インストール

動作を確認しているのは macOS 27。macOS 14 以降向けにビルドしているが、27 より前のバージョンでは試していない。

1. [Releases](https://github.com/Saqoosha/jizura-sync/releases) から `jizura-sync-<version>.zip` をダウンロードして展開する
2. **jizura-sync.app** をアプリケーションフォルダに移して開く。Releases のビルドは公証（notarize）済みなので、警告なしで開ける
3. Spotify かミュージックApp で曲を再生する。jizura-sync が初めてそのアプリを読むとき、macOS がそのアプリの操作を許可するか聞いてくるので、許可する。あとで変えるなら、システム設定 → プライバシーとセキュリティ → オートメーション

新しいバージョンは jizura-sync が自分で確認する。今すぐ確認するなら **jizura-sync → アップデートを確認…**。

## 使い方

- Spotify とミュージックApp のうち、再生しているほうを追う。もう片方で再生を始めれば、そちらに切り替わる。追えるのは、この Mac での再生だけ
- ウィンドウは自由にリサイズできる。手を離すと、JIZURA が描ける形（16:9、9:16、4:3、3:4、1:1、4:5、21:9）のうち一番近いものに合わせる。大きさと、ドラッグしなかった辺は保つ。絵がウィンドウいっぱいに収まる
- 下のバー以外なら、ウィンドウのどこをドラッグしても動かせる
- 歌詞が出ない曲では、理由をウィンドウの中央に出す：見つからない、タイミング付きでない、インストゥルメンタル、検索に失敗した、曲の中の位置がないストリーム（ラジオ）
- 見えているウィンドウで曲を再生している間は、ディスプレイをスリープさせない
- macOS が日本語なら、日本語で表示する

画面下のバーに、ジャケット・曲名と、プレイヤーの再生 / 一時停止・前へ / 次へ・シークがある。`?` キーかバーの `?` ボタンで、次の操作一覧が開く。

| キー | |
|---|---|
| クリック、`H` | バーを隠す / 出す（記憶される）。隠していてもエラーは短く表示される |
| `R` | 別の見た目に変える（スタイル・雰囲気・色・書体・使う部品） |
| `U` | 曲のセクション内で見せ方をそろえる（オン、既定）か、行ごとにばらばらに選ぶ（オフ） |
| `K` | 動き: 見た目まかせ → なめらか → カクカク 12 fps → もっとカクカク 8 fps（手描きアニメのコマ打ち） |
| `[` / `]` | 歌詞が曲より先走る・遅れるときに、50 ms 遅らせる / 早める（記憶される） |
| `Space` | 再生 / 一時停止 |
| `F`、ダブルクリック | 全画面 |
| `?`、`Esc` | ヘルプを開く / 閉じる |

## 制限

- 歌詞の質は LRCLIB のデータ次第。歌詞が無い曲、同期していない歌詞しか無い曲、長さが数秒以上ずれた歌詞しか無い曲は、タイトルだけの画面になり、理由を表示する
- ラジオやライブストリームには曲の中の位置が無いので、歌詞は出ない
- 拍への同期は無い。JIZURA は音声から拍を検出してカットを合わせられるが、jizura-sync はプレイヤーの音声を読めない
- 書体は Google Fonts から必要な分だけ読み込む。最初の数曲は、ネットにつながっていないと本来の見た目にならない

## 免責事項

このプロジェクトは個人の実験。Spotify・Apple・LRCLIB・JIZURA の作者とは関係がなく、承認も支援も受けていない。無保証で提供する（[LICENSE](LICENSE) を参照）。どう使うかは、動かす人の責任。

- **歌詞は許諾を得ていない**。歌詞は作詞者と音楽出版社の著作物。LRCLIB の歌詞は利用者が投稿したもので、LRCLIB もこのプロジェクトも権利者の許諾を得ていない。このプロジェクトは歌詞の権利を一切持たない。歌詞は実行時に取得するだけで、保存も再配布もしない
- **音楽サービスの API は使わない**。同じ Mac の Spotify とミュージックApp を Apple Events で読む。ただし、それで何かの許諾が得られるわけではない。音源の権利は変わらず Spotify と Apple の側にある

## 開発者向け

### ソースからビルド

```bash
git clone --recursive https://github.com/Saqoosha/jizura-sync.git
cd jizura-sync
tools/build-mac.sh                    # build/jizura-sync.app（この Mac 用に ad-hoc 署名）
open build/jizura-sync.app
```

Xcode 26 以降が要る（アイコンを作る `actool` のため）。Xcode プロジェクトは無い。最初のビルドで Sparkle を `build/` にダウンロードする。`--recursive` を付けずに clone したときは `git submodule update --init`。

### 仕組み

- **再生位置**: Spotify とミュージックApp の再生状態と位置を Apple Events で読む。宛先は各アプリのプロセスなので、終了したばかりのプレイヤーを起動しなおすことはない。どちらのアプリも曲の切り替わり・再生・一時停止を通知してくるので、そのたびにすぐ読む。シークは通知されないので、再生中は 1 秒ごとにも読む。一時停止中、再生なし、ウィンドウが隠れているときは何も送らない
- **歌詞**: LRCLIB の同期歌詞（LRC）を、アーティスト・曲名・長さで引く。LRCLIB が一時的に落ちているときは 2 回まで再試行する。LRC は JIZURA の歌詞記法にほぼそのまま渡せるので、変換で行うのは JIZURA の記号のエスケープと、セクションの区切りだけ。区切りは、空行、長い間、繰り返すブロック（サビなど）で入れる。3 行未満のセクションは隣とまとめ、8 行を超えるセクションは割る。統一感はセクションごとに部品を選ぶから
- **描画**: ウィンドウの中身は、`web/` のページを動かす Web ビュー。JIZURA は曲全体の plan（カット・部品・効果）を 1 回だけ作る。レンダラは時刻の純関数で、毎フレーム現在の再生位置の瞬間を描く。シークや一時停止のために持つ状態は無く、一時停止中は同じフレームを描き直さない

### Spotify 用の Web ページ

同じページは、ブラウザだけでも動く。Spotify Web API を通して、どのデバイス（スマホ、PC、スピーカー）で再生している Spotify にも追従する。自分で Spotify の開発者アプリを用意できる人向けで、Spotify の **Premium** アカウントと、無料の開発者アプリ（Client ID）が要る。準備は 5 分ほど。ブラウザの中だけで動き、こちら側のサーバーは無い。Spotify のトークンと設定はページの localStorage に残り、送り先は Spotify だけ。

1. ページを起動する

   ```bash
   ./serve.sh            # http://127.0.0.1:5180/
   ```

2. Spotify app を作る
   1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) で **Create app**
   2. 名前と説明は何でもよい
   3. **Redirect URIs** に `http://127.0.0.1:5180/` をそのまま入れる（末尾の `/` も要る）。Spotify はループバックの IP なら受け付けるが、`localhost` は拒否する
   4. **Which API/SDKs are you planning to use?** で **Web API** にチェックして保存
   5. app の **Settings** から **Client ID** をコピー。Client ID は公開の識別子で、秘密ではない。認証は PKCE なので、client secret はどこにも出てこない

3. <http://127.0.0.1:5180/> を開き、Client ID を貼って **Spotify に接続**。設定画面に、このページが期待する Redirect URI が出るので、app に登録した値と見比べられる。どのデバイスでもいいので Spotify で曲を再生すれば、歌詞がそれに追従する

ヘルプのいちばん下の **Spotify から切断** でトークンを消す。アクセス権を完全に取り消すには、[spotify.com/account/apps](https://www.spotify.com/account/apps/) から app を外す。`?mock` を付けると、Spotify なしで固定の曲をページ内の時計で再生する。`?mock=Artist|Title|durationMs` で曲を選び、`&t=30` で 30 秒目から始める。

Spotify は web app に再生状態を送ってこないので、ページは `GET /me/player` を 1 秒ごとに読み、その間の位置は補間する。読み取った値は、リクエストの往復時間の中点の時刻に対応づける。

- **他のアカウント**: 作ったばかりの Spotify app は開発モードで、使えるのは 5 アカウントまで。使う人を app の **User Management** に登録する。登録していないアカウントは全 API が `403` になり、ページにもそう表示される
- **ポートを変える**: `PORT=8080 ./serve.sh` にして、`http://127.0.0.1:8080/` を登録する
- **自分でホストする**（GitHub Pages など静的ホスティング）: `web/` を submodule ごと置き、そのページの `https://` の URL を Redirect URI に登録する。URI はクエリとハッシュを除いたページのアドレスで、設定画面に表示される
- **キーボードのない端末**（車のブラウザ）: `SPOTIFY_CLIENT_ID=<id> tools/deploy-cloudflare.sh` で `web/` を自分の Cloudflare アカウントにデプロイする。Client ID が入った状態になるので、何も入力しなくていい。Tesla のブラウザではヘルプのキーがタップできるボタンになる。`?tesla` を付けるとどのブラウザでも同じ表示になる。デプロイ先は自分の端末だけで使う

### Web ページの規約

- **Spotify は、このような app の公開を認めていない**。Web API を使うと、その人は Spotify の開発者になり、[Spotify Developer Terms](https://developer.spotify.com/terms) と [Developer Policy](https://developer.spotify.com/policy) に従うことになる。Policy の III 章には「Do not synchronize any sound recordings with any visual media, including any advertising, film, television program, slideshow, video, or similar content.」（音源を、広告・映画・テレビ番組・スライドショー・動画などの映像と同期させてはならない）とある。再生中の曲に合わせた歌詞モーションは、この同期にあたる。Web ページを動かす人は、自分用の Spotify app を作る。規約は app ごとに別の資格情報を使うよう求めているので、ほかのプロジェクトの Client ID を流用してはいけない。開発モードのその app を使えるのは、app に登録した 5 アカウントまでで、その人たちは同じ Client ID を使う
- **Apple Music も認めていない**。だから Web ページに Apple Music 版は無い。Apple Developer Program License Agreement の MusicKit の条項に「MusicKit Content cannot be synchronized with any other content, unless otherwise permitted by Apple in the Documentation.」（Apple が文書で許可した場合を除き、MusicKit のコンテンツを他のコンテンツと同期させてはならない）とある。Mac アプリは MusicKit を使わない
- **Web ページを他人向けのサービスとしてホストしないこと**。デプロイは、自分と、自分の Spotify app に登録したアカウントだけで使う

### JIZURA の更新

```bash
git -C web/vendor/JIZURA fetch --depth 1 origin main
git -C web/vendor/JIZURA checkout FETCH_HEAD
tools/update-jizura-scripts.sh      # web/index.html の <script> タグを作り直す
```

ページは JIZURA の `src/*.js` をファイル名順に直接読み込む。JIZURA のエディタ UI である `src/12_ui.js` だけは読まない。

## 謝辞

歌詞モーションはすべて、[852wa](https://github.com/852wa) さんの [JIZURA](https://github.com/852wa/JIZURA) によるもの。このプロジェクトがしているのは、再生中の曲の位置と歌詞を JIZURA に渡すことだけ。画面に出るレイアウト・動き・装飾・ランダムな見た目は、どれも JIZURA の仕事。JIZURA が MIT ライセンスで公開されていたから、この実験ができた。感謝。エディタや動画書き出しを備えた本家は <https://852wa.github.io/JIZURA/> で試せる。

アプリのアップデートには [Sparkle](https://sparkle-project.org)（MIT）を使っている。

## ライセンス

MIT（[LICENSE](LICENSE)）。JIZURA は © 852wa の MIT ライセンスで、submodule として含めている（`web/vendor/JIZURA/LICENSE` と `THIRD_PARTY_NOTICES.md`）。Sparkle は © the Sparkle Project の MIT ライセンスで、アプリに同梱している。歌詞は実行時に LRCLIB から取得するもので、このリポジトリには含まれない。
