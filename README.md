# meural-signage

English | [日本語](README.ja.md)

**A self-hosted information dashboard — weather, Spotify now-playing, Entetsu bus
arrivals, train/Shinkansen status, and Google Calendar — rendered in a browser
and streamed full-screen to a [Meural Canvas](https://github.com/nharu-0630/meural-hls)
as live video.**

The server aggregates five live data sources and serves a 1920×1080 signage page.
A browser renders it. A headless Chromium instance captures that render and
produces a local HLS stream, which [`meural-hls`](https://github.com/nharu-0630/meural-hls)
pushes to the Canvas — so the picture frame shows a live, auto-updating dashboard
with no cloud service and no firmware changes on the device.

```
 data sources          server (Node/Fastify)        browser            device
 ───────────────       ─────────────────────        ───────────        ──────────────
 Open-Meteo ───┐                                  ┌─ signage page
 Spotify    ───┤   providers → StateStore → SSE ──┤  (1920×1080,       Meural Canvas
 Entetsu bus ──┤                 │                │   SSE live update)  via meural-hls
 Yahoo diainfo ┤                 └─ /api/state    └─ headless Chromium
 Google Cal ───┘                    /api/events        │ CDP screencast
                                     /hls/live.m3u8 ◄───┘ → ffmpeg → HLS
```

## Widgets & data sources

| Widget | Source | Needs a key? |
|---|---|---|
| 天気 Weather (current + hourly + 5-day) | [Open-Meteo](https://open-meteo.com/) | No |
| ♪ Spotify now-playing | Spotify Web API | Yes (one-time OAuth) |
| 🚌 遠鉄バス arrivals | Entetsu bus-location (NAVITIME transfer-cloud public JSON) | No |
| 🚆 鉄道・新幹線 status | [Yahoo! 路線情報](https://transit.yahoo.co.jp/diainfo/) | No |
| 📅 Google Calendar | Google Calendar API | Yes (one-time OAuth) |

Each widget degrades gracefully: a failing fetch keeps the last good value
(marked *stale*); missing credentials show an *unconfigured* hint instead of
breaking the page.

## Requirements

- **Node.js ≥ 20** and **ffmpeg** (with libx264) for the stream
- A **Meural Canvas** reachable on your LAN + the sibling
  [`meural-hls`](https://github.com/nharu-0630/meural-hls) repo (only needed to
  push to the device; the dashboard works standalone in any browser)

## Quick start

```bash
git clone https://github.com/nharu-0630/meural-signage.git
cd meural-signage
npm install

cp config.example.json config.json   # edit location / stops / lines
cp .env.example .env                  # optional: Spotify & Google credentials

npm run build                         # build the web frontend + server
npm start                             # http://localhost:7000
```

Open `http://localhost:7000` — the dashboard renders immediately with weather,
bus and train data. Spotify and Calendar fill in once their credentials are set.

Want to preview the fully-populated layout (playing track, bus arrivals, events)
without credentials or waiting for buses to run? Open
`http://localhost:7000/?demo=1`.

For development with hot reload:

```bash
npm run dev        # Vite dev server (:5173) + API/server (:7000)
```

## Configuration

Everything non-secret lives in `config.json` (copy from `config.example.json`).
Secrets can go in `config.json` too, or in `.env` (which overrides it).

- **location** — `name`, `lat`, `lon`, `timezone` for the weather widget. Defaults
  to 浜松 (Hamamatsu).
- **providers.entetsuBus.stops[]** — each stop is a NAVITIME *course*. Find the
  `courseId` from the official bus-location URL:
  `https://transfer-cloud.navitime.biz/entetsu/approachings/<courseId>/location-map`.
- **providers.trains** — `yahooPref` is the Yahoo! 路線情報 prefecture code
  (22 = 静岡). `lines[]` are line codes: `7`=東海道新幹線, `192`=東海道本線(熱海〜豊橋),
  `249`=遠州鉄道線, `254`=天竜浜名湖鉄道線. Mark `"shinkansen": true` to show a line
  in the Shinkansen section.

### Spotify (one-time)

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add redirect URI `http://127.0.0.1:7000/auth/spotify/callback`.
3. Put `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` in `.env`, then:

   ```bash
   npm run auth:spotify
   ```

   Authorize in the browser; paste the printed `SPOTIFY_REFRESH_TOKEN` into `.env`.

### Google Calendar (one-time)

1. In [Google Cloud Console](https://console.cloud.google.com), enable the
   Calendar API and create an OAuth client; add redirect URI
   `http://127.0.0.1:7000/auth/google/callback`.
2. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, then:

   ```bash
   npm run auth:google
   ```

   Authorize; paste the printed `GOOGLE_REFRESH_TOKEN` into `.env`. Set the
   calendars to show in `config.json → providers.calendar.calendarIds`.

## Streaming to the Meural Canvas

meural-signage produces the stream; `meural-hls` delivers it to the device.

```bash
# 1) Install Chromium for the headless renderer (first time only)
npx playwright install chromium

# 2) Run the server with the renderer enabled — serves /hls/live.m3u8
npm run stream          # (or set "stream.enabled": true in config.json)

# 3) In the meural-hls repo, point its pusher at our local HLS stream:
cd ../meural-hls
MEURAL_HOST=<device-ip> python3 mac/deploy_live.py
HLS_URL=http://127.0.0.1:7000/hls/live.m3u8 MEURAL_HOST=<device-ip> python3 mac/hls_push.py
```

The Canvas then shows the dashboard full-screen, updating in real time. To return
the frame to normal, run `meural-hls`'s `restore_gallery.py`.

### How the stream stays smooth

The renderer captures the page via Chromium's CDP screencast and writes the most
recent frame to ffmpeg at a constant `fps` — even when the page is visually idle —
so ffmpeg always gets constant-rate input and `meural-hls`'s real-time drip never
starves. ffmpeg encodes 1920×1080 H.264 into 2-second MPEG-TS HLS segments.

## HTTP API

| Endpoint | Purpose |
|---|---|
| `GET /` | the signage page |
| `GET /api/state` | current aggregated state (JSON snapshot) |
| `GET /api/events` | Server-Sent Events stream of live updates |
| `GET /hls/live.m3u8` | the HLS stream (when the renderer is running) |
| `GET /healthz` | liveness + last update time |

## Repository layout

```
server/                Node + TypeScript backend
  src/config.ts        config.json + env loader
  src/state.ts         single source of truth + SSE fan-out
  src/providers/       one file per data source (weather, spotify,
                       entetsu-bus, trains, calendar) + base scheduler
  src/renderer/        headless Chromium screencast → ffmpeg → HLS
  src/auth/            one-time OAuth helpers (spotify / google)
  src/server.ts        Fastify: static web, /api/*, /hls/*
web/                   Vite + TypeScript signage frontend (1920×1080)
config.example.json    copy to config.json
.env.example           copy to .env (optional secrets)
```

## Notes on data sources

The Entetsu bus and Yahoo! 路線情報 endpoints are the public JSON/HTML that their
own sites use; this project reads them politely at modest intervals (bus 30 s,
trains 120 s by default) for personal, non-commercial display. Respect each
service's terms of use and don't lower the intervals aggressively.

## License

MIT
