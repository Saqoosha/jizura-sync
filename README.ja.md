# jizura-sync

Spotify で再生中の曲を、リアルタイムに歌詞モーションにする。どのデバイスで再生していても追従する。

再生中の曲の同期歌詞を [LRCLIB](https://lrclib.net) から取り、[JIZURA](https://github.com/852wa/JIZURA) で描く。JIZURA は、数百の小さな部品（レイアウト・動き・装飾）を組み合わせて文字PVを組み立てるブラウザのエンジン。曲ごとに見た目が決まり、`R` で引き直せる。

[English](README.md)

> **公開サービスではなく、公開サービスにはできない。** Spotify と Apple の開発者規約はどちらも、音楽と映像の同期を禁じている。このアプリがやっていることはまさにそれ。歌詞はコミュニティのデータベースから取っていて、許諾を得ていない。このリポジトリは個人の実験用のソースコード。動かしたり共有したりする前に、[免責事項](#免責事項)を読むこと。

- ブラウザの中だけで動く。こちら側のサーバーは無い。Spotify のトークンと設定はページの localStorage に残り、送り先は Spotify だけ
- Spotify app は各自で用意する（無料の Client ID）。手順は下に書いた。5 分ほどで済む
- ビルド不要。静的ファイルと、git submodule の JIZURA だけ

## セットアップ

Spotify の **Premium** アカウントが要る。開発モードの app は、持ち主が Premium でないと動かない。

### 1. コードを取る

```bash
git clone --recursive https://github.com/Saqoosha/jizura-sync.git
cd jizura-sync
./serve.sh            # http://127.0.0.1:5180/
```

`--recursive` を付けずに clone したときは `git submodule update --init`。

### 2. Spotify app を作る

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) で **Create app**
2. 名前と説明は何でもよい
3. **Redirect URIs** に `http://127.0.0.1:5180/` を**そのまま**入れる（末尾の `/` も要る）。Spotify はループバックの IP なら受け付けるが、`localhost` は拒否する
4. **Which API/SDKs are you planning to use?** で **Web API** にチェックして保存
5. app の **Settings** から **Client ID** をコピー

Client ID は公開の識別子で、秘密ではない。認証は PKCE なので、client secret はどこにも出てこない。

### 3. つなぐ

<http://127.0.0.1:5180/> を開き、Client ID を貼って **Connect Spotify**。設定画面に、このページが期待する Redirect URI が出るので、app に登録した値と見比べられる。

あとは、どのデバイスでもいいので Spotify で曲を再生する。歌詞がそれに追従する。

### 他の人、他の場所で使う

- **他のアカウント**: 作ったばかりの Spotify app は開発モードで、自分以外に使えるのは 5 アカウントまで。使う人を app の **User Management** に登録する。登録していないアカウントは全 API が `403` になり、ページにもそう表示される
- **ポートを変える**: `PORT=8080 ./serve.sh` にして、`http://127.0.0.1:8080/` を登録する
- **自分でホストする**（GitHub Pages など静的ホスティング）: `web/` を submodule ごと置き、そのページの `https://` の URL を Redirect URI に登録する。URI はクエリとハッシュを除いたページのアドレスで、設定画面に表示される

## 操作

画面下のバーに、ジャケット・曲名と、Spotify の再生 / 一時停止・前へ / 次へ・シークがある。`?` キーかバーの `?` ボタンで、下の操作一覧が開く。

| キー | |
|---|---|
| クリック、`H` | バーを隠す / 出す（記憶される）。隠していてもエラーは短く表示される |
| `R` | 見た目を引き直す（スタイル・雰囲気・色・書体・使う部品） |
| `U` | 曲のセクション内で見せ方をそろえる（オン、既定）か、行ごとにばらばらに選ぶ（オフ） |
| `K` | 動き: 見た目まかせ → なめらか → カクカク 12 fps → もっとカクカク 8 fps（手描きアニメのコマ打ち） |
| `[` / `]` | 歌詞が曲より先走る・遅れるときに、50 ms 遅らせる / 早める（記憶される） |
| `Space` | Spotify の再生 / 一時停止 |
| `F`、ダブルクリック | 全画面 |
| `?`、`Esc` | ヘルプを開く / 閉じる |

ヘルプのいちばん下の **Disconnect Spotify** でトークンを消す。アクセス権を完全に取り消すには、[spotify.com/account/apps](https://www.spotify.com/account/apps/) から app を外す。

### Spotify なしで試す

`http://127.0.0.1:5180/?mock` で、固定の曲をページ内の時計で再生する。`?mock=Artist|Title|durationMs` で曲を選び、`&t=30` で 30 秒目から始める。

## 仕組み

- **再生位置**: Spotify は web app に再生状態を送ってこないので、`GET /me/player` を 1 秒ごとに読み、その間の位置は補間する。読み取った値は、リクエストの往復時間の中点の時刻に対応づける
- **歌詞**: LRCLIB の同期歌詞（LRC）を、アーティスト・曲名・長さで引く。LRC は JIZURA の歌詞記法にほぼそのまま渡せるので、変換で行うのは JIZURA の記号のエスケープと、セクションの区切りだけ。区切りは、空行、長い間、繰り返すブロック（サビなど）で入れる。3 行未満のセクションは隣とまとめ、8 行を超えるセクションは割る。統一感はセクションごとに部品を選ぶから
- **描画**: JIZURA は曲全体の plan（カット・部品・効果）を 1 回だけ作る。レンダラは時刻の純関数で、毎フレーム現在の再生位置の瞬間を描く。シークや一時停止のために持つ状態は無い

## 制限

- 歌詞の質は LRCLIB のデータ次第。歌詞が無い曲や、同期していない歌詞しか無い曲は、タイトルだけの画面になる
- 拍への同期は無い。JIZURA は音声から拍を検出してカットを合わせられるが、web app からは Spotify の音声を読めない
- 書体は Google Fonts から必要な分だけ読み込む

## 免責事項

このプロジェクトは個人の実験。Spotify・Apple・LRCLIB・JIZURA の作者とは関係がなく、承認も支援も受けていない。無保証で提供する（[LICENSE](LICENSE) を参照）。どう使うかは、動かす人の責任。

- **Spotify は、このような app の公開を認めていない。** Web API を使うと、その人は Spotify の開発者になり、[Spotify Developer Terms](https://developer.spotify.com/terms) と [Developer Policy](https://developer.spotify.com/policy) に従うことになる。Policy の III 章には「Do not synchronize any sound recordings with any visual media, including any advertising, film, television program, slideshow, video, or similar content.」（音源を、広告・映画・テレビ番組・スライドショー・動画などの映像と同期させてはならない）とある。再生中の曲に合わせた歌詞モーションは、この同期にあたる。動かす人は、自分用の Spotify app を作る。規約は app ごとに別の資格情報を使うよう求めているので、ほかのプロジェクトの Client ID を流用してはいけない。開発モードのその app を使えるのは、app に登録した 5 アカウントまでで、その人たちは同じ Client ID を使う
- **Apple Music も認めていない。** だから Apple Music 版は無い。Apple Developer Program License Agreement の MusicKit の条項に「MusicKit Content cannot be synchronized with any other content, unless otherwise permitted by Apple in the Documentation.」（Apple が文書で許可した場合を除き、MusicKit のコンテンツを他のコンテンツと同期させてはならない）とある
- **歌詞は許諾を得ていない。** 歌詞は作詞者と音楽出版社の著作物。LRCLIB の歌詞は利用者が投稿したもので、LRCLIB もこのプロジェクトも権利者の許諾を得ていない。このプロジェクトは歌詞の権利を一切持たない。歌詞は実行時に取得するだけで、保存も再配布もしない
- **他人向けのサービスとしてホストしないこと。** デプロイは、自分と、自分の Spotify app に登録したアカウントだけで使う

## JIZURA の更新

```bash
git -C web/vendor/JIZURA fetch --depth 1 origin main
git -C web/vendor/JIZURA checkout FETCH_HEAD
tools/update-jizura-scripts.sh      # web/index.html の <script> タグを作り直す
```

ページは JIZURA の `src/*.js` をファイル名順に直接読み込む。JIZURA のエディタ UI である `src/12_ui.js` だけは読まない。

## 謝辞

歌詞モーションはすべて、[852wa](https://github.com/852wa) さんの [JIZURA](https://github.com/852wa/JIZURA) によるもの。このプロジェクトがしているのは、再生中の曲の位置と歌詞を JIZURA に渡すことだけ。画面に出るレイアウト・動き・装飾・ランダムな見た目は、どれも JIZURA の仕事。JIZURA が MIT ライセンスで公開されていたから、この実験ができた。感謝。エディタや動画書き出しを備えた本家は <https://852wa.github.io/JIZURA/> で試せる。

## ライセンス

MIT（[LICENSE](LICENSE)）。JIZURA は © 852wa の MIT ライセンスで、submodule として含めている（`web/vendor/JIZURA/LICENSE` と `THIRD_PARTY_NOTICES.md`）。歌詞は実行時に LRCLIB から取得するもので、このリポジトリには含まれない。
