# meural-signage (日本語)

[English](README.md) | 日本語

**セルフホストの情報サイネージ — 天気・Spotify再生中・遠鉄バス接近・鉄道/新幹線の運行情報・
Googleカレンダー — をブラウザでレンダリングし、[Meural Canvas](https://github.com/nharu-0630/meural-hls)
へ全画面のライブ映像として配信する。**

サーバが5種のライブデータを集約して1920×1080のサイネージ画面を配信します。ブラウザがそれを描画し、
ヘッドレスChromiumがその描画をキャプチャしてローカルのHLSストリームを生成、
[`meural-hls`](https://github.com/nharu-0630/meural-hls) がそれをCanvasへ送出します。
クラウド不使用・端末のファーム無改変で、自動更新されるダッシュボードが額縁に表示されます。

```
 データソース          サーバ (Node/Fastify)        ブラウザ            端末
 ───────────────       ─────────────────────        ───────────        ──────────────
 Open-Meteo ───┐                                  ┌─ サイネージ画面
 Spotify    ───┤  providers → StateStore → SSE ───┤  (1920×1080,       Meural Canvas
 遠鉄バス    ──┤                 │                │   SSEでライブ更新)  (meural-hls経由)
 Yahoo路線情報 ┤                 └─ /api/state    └─ ヘッドレスChromium
 Googleカレ ───┘                    /api/events        │ CDP screencast
                                     /hls/live.m3u8 ◄───┘ → ffmpeg → HLS
```

## ウィジェットとデータソース

| ウィジェット | ソース | キー要否 |
|---|---|---|
| 天気（現在＋時間別＋5日間） | [Open-Meteo](https://open-meteo.com/) | 不要 |
| ♪ Spotify 再生中 | Spotify Web API | 必要（初回OAuthのみ） |
| 🚌 遠鉄バス 接近情報 | 遠鉄バスロケーション（NAVITIME transfer-cloud の公開JSON） | 不要 |
| 🚆 鉄道・新幹線 運行情報 | [Yahoo! 路線情報](https://transit.yahoo.co.jp/diainfo/) | 不要 |
| 📅 Googleカレンダー | Google Calendar API | 必要（初回OAuthのみ） |

各ウィジェットは堅牢に劣化します。取得失敗時は直前の値を保持（*stale*表示）、
資格情報が未設定なら画面を壊さず *未設定* のヒントを表示します。

## 必要環境

- **Node.js ≥ 20**、**pnpm 10.34.6** と、配信用の **ffmpeg**（libx264 入り）
- LAN上の **Meural Canvas** と、送出用の兄弟リポジトリ
  [`meural-hls`](https://github.com/nharu-0630/meural-hls)
  （端末への送出時のみ必要。ダッシュボード自体は任意のブラウザ単体で動作します）

## クイックスタート

```bash
git clone https://github.com/nharu-0630/meural-signage.git
cd meural-signage
pnpm install

cp config.example.json config.json   # 位置・バス停・路線を編集
cp .env.example .env                  # 任意: Spotify / Google の資格情報

pnpm build                         # フロント + サーバをビルド
pnpm start                             # http://localhost:7000
```

`http://localhost:7000` を開くと、天気・バス・鉄道はすぐに表示されます。
Spotifyとカレンダーは資格情報を設定すると表示されます。

資格情報なしで、全ウィジェットが揃った状態（再生中の曲・バス接近・予定）を確認したい場合は
`http://localhost:7000/?demo=1` を開いてください。

開発（ホットリロード）:

```bash
pnpm dev        # Vite devサーバ(:5173) + API/サーバ(:7000)
```

## 設定

秘密情報以外はすべて `config.json`（`config.example.json` をコピー）にあります。
秘密情報は `config.json` に書いても、`.env`（こちらが優先）に書いても構いません。

- **location** — 天気用の `name` / `lat` / `lon` / `timezone`。既定は浜松。
- **providers.entetsuBus.stops[]** — 各停留所は NAVITIME の *course*。`courseId` は
  公式バスロケのURLから取得:
  `https://transfer-cloud.navitime.biz/entetsu/approachings/<courseId>/location-map`
- **providers.trains** — `yahooPref` は Yahoo!路線情報の都道府県コード（22 = 静岡）。
  `lines[]` は路線コード: `7`=東海道新幹線, `192`=東海道本線(熱海〜豊橋),
  `249`=遠州鉄道線, `254`=天竜浜名湖鉄道線。`"shinkansen": true` で新幹線枠に表示。

### Spotify（初回のみ）

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) でアプリを作成。
2. リダイレクトURI `http://127.0.0.1:7000/auth/spotify/callback` を登録。
3. `.env` に `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` を設定して実行:

   ```bash
   pnpm auth:spotify
   ```

   ブラウザで認可し、表示された `SPOTIFY_REFRESH_TOKEN` を `.env` に貼り付け。

### Googleカレンダー（初回のみ）

1. [Google Cloud Console](https://console.cloud.google.com) で Calendar API を有効化し
   OAuthクライアントを作成。リダイレクトURI `http://127.0.0.1:7000/auth/google/callback` を登録。
2. `.env` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を設定して実行:

   ```bash
   pnpm auth:google
   ```

   認可後、表示された `GOOGLE_REFRESH_TOKEN` を `.env` に貼り付け。表示するカレンダーは
   `config.json → providers.calendar.calendarIds` で指定。

## Meural Canvas への配信

映像の生成は meural-signage、端末への送出は `meural-hls` が担います。

```bash
# 1) ヘッドレスレンダラ用に Chromium を導入（初回のみ）
pnpm browser:install

# 2) レンダラ有効でサーバ起動 — /hls/live.m3u8 を配信
pnpm stream          # または config.json の "stream.enabled": true

# 3) meural-hls 側で、ローカルのHLSストリームを指定して送出:
cd ../meural-hls
MEURAL_HOST=<端末IP> uv run python mac/deploy_live.py
HLS_URL=http://127.0.0.1:7000/hls/live.m3u8 MEURAL_HOST=<端末IP> uv run python mac/hls_push.py
```

Canvasにダッシュボードが全画面でリアルタイム表示されます。通常表示へ戻すには
`meural-hls` の `restore_gallery.py` を実行します。

### 途切れない配信の仕組み

レンダラは ChromiumのCDP screencast で画面を取得し、直近フレームを一定 `fps` で
ffmpegへ書き込みます（画面が静止中でも）。これによりffmpegは常にCFR入力を受け取り、
`meural-hls` の実時間dripが枯渇しません。ffmpegは1920×1080 H.264 を2秒区切りの
MPEG-TS HLSセグメントにエンコードします。

## HTTP API

| エンドポイント | 用途 |
|---|---|
| `GET /` | サイネージ画面 |
| `GET /api/state` | 現在の集約状態（JSONスナップショット） |
| `GET /api/events` | ライブ更新のServer-Sent Events |
| `GET /hls/live.m3u8` | HLSストリーム（レンダラ稼働時） |
| `GET /healthz` | 生存確認＋最終更新時刻 |

## 構成

```
server/                Node + TypeScript バックエンド
  src/config.ts        config.json + env ローダ
  src/state.ts         単一の状態ソース + SSE配信
  src/providers/       データソース毎（weather / spotify /
                       entetsu-bus / trains / calendar）+ 基底スケジューラ
  src/renderer/        ヘッドレスChromium screencast → ffmpeg → HLS
  src/auth/            初回OAuthヘルパ（spotify / google）
  src/server.ts        Fastify: 静的配信, /api/*, /hls/*
web/                   Vite + TypeScript サイネージフロント (1920×1080)
config.example.json    config.json にコピー
.env.example           .env にコピー（任意の秘密情報）
```

## データソースについて

遠鉄バスと Yahoo!路線情報 のエンドポイントは、各サイト自身が使う公開JSON/HTMLです。
本プロジェクトは個人・非商用の表示目的で、控えめな間隔（既定: バス30秒・鉄道120秒）で
礼儀正しく参照します。各サービスの利用規約を尊重し、間隔を過度に短くしないでください。

## ライセンス

MIT

## 開発・検証

pnpm 10.34.6を `packageManager` に固定し、`pnpm-lock.yaml` を使用します。
`shared` workspaceでサーバー・画面共通の型と、`/api/state`・SSEの
実行時検証スキーマを管理し、依存順にビルドします。`.env` はworkspace経由の
起動でもリポジトリ直下から読み込みます。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm browser:install
pnpm test:stream  # Chromiumとffmpeg/ffprobeで実HLS・DOMを確認
```

不正なポート・映像サイズ・更新間隔などの設定は、起動時に検証エラーとして
報告します。`config.json` または環境変数の該当箇所を修正してください。
画面は未変更のカードを保持し、SSEとffmpegへの出力待ちを考慮して
メモリの無制限な増加を防止します。

既定の横画面HLS出力をmeural-hlsへ送る場合、`HLS_COPY=1` で
二重エンコードを省略できます。形式が異なる入力には既定の再エンコードを
使ってください。ホスト側Pythonの実行にはmeural-hls側でuvを使用し、
初回に `uv sync --locked` を実行してください。
