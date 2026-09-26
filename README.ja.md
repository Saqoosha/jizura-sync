# jizura-sync

Spotify で再生中の曲を、リアルタイムに歌詞モーションにする。どのデバイスで再生していても追従する。

再生中の曲の同期歌詞を [LRCLIB](https://lrclib.net) から取り、[JIZURA](https://github.com/852wa/JIZURA) で描く。JIZURA は、数百の小さな部品（レイアウト・動き・装飾）を組み合わせて文字PVを組み立てるブラウザのエンジン。曲ごとに見た目が決まり、`R` で引き直せる。

[English](README.md)

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

| キー | |
|---|---|
| `R` | 見た目を引き直す（スタイル・雰囲気・色・書体・使う部品） |
| `U` | 統一感のオン/オフ。オン（既定）だと、曲のセクションごとに使うレイアウトと動きを絞り、繰り返す行を同じ見せ方にする |
| `K` | コマ打ち: 見た目まかせ → 毎フレーム → 12 コマ/秒 → 8 コマ/秒。JIZURA は既定で、手描きアニメの 2 コマ打ちのように動く |
| `[` / `]` | 歌詞が早い・遅いときに −50 / +50 ms ずらす（記憶される） |
| `Space` | Spotify の再生 / 一時停止 |
| `F`、ダブルクリック | 全画面 |

マウスを動かすと表示が出る。右上の **Disconnect** でトークンを消す。アクセス権を完全に取り消すには、[spotify.com/account/apps](https://www.spotify.com/account/apps/) から app を外す。

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

## Spotify の規約

Web API を使うと、その人は Spotify の開発者になる。作った app には [Spotify Developer Terms](https://developer.spotify.com/terms) と [Developer Policy](https://developer.spotify.com/policy) が適用される。デプロイしたものを誰かと共有する前に読むこと（特に Policy の III 章）。このプロジェクトは個人用の実験で、Spotify・LRCLIB・JIZURA とは関係ない。

## JIZURA の更新

```bash
git -C web/vendor/JIZURA fetch --depth 1 origin main
git -C web/vendor/JIZURA checkout FETCH_HEAD
tools/update-jizura-scripts.sh      # web/index.html の <script> タグを作り直す
```

ページは JIZURA の `src/*.js` をファイル名順に直接読み込む。JIZURA のエディタ UI である `src/12_ui.js` だけは読まない。

## ライセンス

MIT（[LICENSE](LICENSE)）。JIZURA は © 852wa の MIT ライセンスで、submodule として含めている（`web/vendor/JIZURA/LICENSE` と `THIRD_PARTY_NOTICES.md`）。歌詞は実行時に LRCLIB から取得するもので、このリポジトリには含まれない。
