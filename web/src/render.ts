import type {
  SignageState,
  WeatherState,
  SpotifyState,
  BusState,
  TrainsState,
  CalendarState,
  WidgetMeta,
} from "./types.js";
import { weatherIcon, spotifyGlyph } from "./icons.js";
import { dayLabel, escapeHtml, hhmm, pad } from "./format.js";

function statusBadge(meta: WidgetMeta): string {
  switch (meta.status) {
    case "ok":
      return "";
    case "stale":
      return `<span class="badge warn">更新待ち</span>`;
    case "error":
      return `<span class="badge err">取得失敗</span>`;
    case "unconfigured":
      return `<span class="badge muted">未設定</span>`;
    case "disabled":
      return `<span class="badge muted">無効</span>`;
  }
}

function card(area: string, title: string, meta: WidgetMeta, body: string): string {
  return `<section class="card ${area}" style="grid-area:${area}">
    <header class="card-h"><h2>${title}</h2>${statusBadge(meta)}</header>
    <div class="card-b">${body}</div>
  </section>`;
}

/* ---------------- weather ---------------- */
function weatherBody(w: WeatherState): string {
  if (!w.current) return `<p class="empty">天気情報を取得できませんでした</p>`;
  const c = w.current;
  const hourly = w.hourly
    .map(
      (h) => `<div class="hr">
        <div class="hr-t">${new Date(h.time).getHours()}時</div>
        <div class="hr-i">${weatherIcon(iconForCode(h.code), isDayHour(h.time))}</div>
        <div class="hr-temp">${h.temp}°</div>
        <div class="hr-pop ${h.pop >= 50 ? "hi" : ""}">${h.pop}%</div>
      </div>`,
    )
    .join("");
  const daily = w.daily
    .map(
      (d) => `<div class="dy">
        <span class="dy-d">${dayLabel(d.date)}</span>
        <span class="dy-i">${weatherIcon(iconForCode(d.code), true)}</span>
        <span class="dy-pop">${d.pop}%</span>
        <span class="dy-t"><b>${d.max}°</b> <i>${d.min}°</i></span>
      </div>`,
    )
    .join("");
  return `
    <div class="wx-now">
      <div class="wx-icon">${weatherIcon(c.icon, c.isDay)}</div>
      <div class="wx-main">
        <div class="wx-temp">${Math.round(c.temp)}<span>°</span></div>
        <div class="wx-desc">${escapeHtml(c.desc)}</div>
      </div>
      <div class="wx-sub">
        <div>体感 <b>${Math.round(c.apparent)}°</b></div>
        <div>湿度 <b>${c.humidity}%</b></div>
        <div>風 <b>${c.windSpeed}</b> km/h</div>
      </div>
    </div>
    <div class="wx-hourly">${hourly}</div>
    <div class="wx-daily">${daily}</div>`;
}

// re-decode WMO group to an icon key on the client for hourly/daily cells
function iconForCode(code: number): string {
  if (code === 0) return "clear";
  if (code === 1) return "mostly-clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}
function isDayHour(iso: string): boolean {
  const h = new Date(iso).getHours();
  return h >= 6 && h < 18;
}

/* ---------------- spotify ---------------- */
function spotifyBody(s: SpotifyState): string {
  if (s.status === "unconfigured")
    return `<p class="empty">Spotify 未設定 — <code>npm run auth:spotify</code></p>`;
  if (!s.track) return `<div class="sp-idle">${spotifyGlyph}<span>再生していません</span></div>`;
  const t = s.track;
  const art = t.artUrl
    ? `<img class="sp-art" src="${escapeHtml(t.artUrl)}" alt="">`
    : `<div class="sp-art sp-art-x">${spotifyGlyph}</div>`;
  return `
    <div class="sp" data-playing="${s.isPlaying}" data-progress="${t.progressMs}" data-duration="${t.durationMs}">
      ${art}
      <div class="sp-info">
        <div class="sp-title">${escapeHtml(t.title)}</div>
        <div class="sp-artist">${escapeHtml(t.artists)}</div>
        <div class="sp-album">${escapeHtml(t.album)}</div>
        <div class="sp-bar"><div class="sp-fill" id="sp-fill"></div></div>
        <div class="sp-time"><span id="sp-cur">0:00</span><span id="sp-dur">0:00</span></div>
      </div>
      ${s.isPlaying ? `<div class="sp-eq"><i></i><i></i><i></i><i></i></div>` : ""}
    </div>`;
}

/* ---------------- bus ---------------- */
function busBody(b: BusState): string {
  if (!b.stops.length) return `<p class="empty">バス停が未設定です</p>`;
  return b.stops
    .map((stop) => {
      const rows = stop.arrivals.length
        ? stop.arrivals
            .map(
              (a) => `<li class="bus-row ${a.etaMin !== null && a.etaMin <= 1 ? "soon" : ""}">
                <span class="bus-eta">${a.etaMin === null ? "—" : a.etaMin <= 0 ? "まもなく" : `${a.etaMin}<b>分</b>`}</span>
                <span class="bus-dest">${escapeHtml(a.dest)}</span>
                <span class="bus-meta">${a.scheduled ? `定刻 ${a.scheduled}` : ""} ${a.status ? `· ${escapeHtml(a.status)}` : ""}</span>
              </li>`,
            )
            .join("")
        : `<li class="bus-none">この時間帯の運行はありません</li>`;
      return `<div class="bus-stop"><div class="bus-label">${escapeHtml(stop.label)}</div><ul>${rows}</ul></div>`;
    })
    .join("");
}

/* ---------------- trains ---------------- */
function lineRow(name: string, status: string, normal: boolean, shinkansen: boolean, detail?: string): string {
  const cls = normal ? "ok" : status.includes("見合") || status.includes("運休") ? "stop" : "warn";
  return `<li class="tr-row">
    <span class="tr-name">${shinkansen ? `<i class="tr-chip">新</i>` : ""}${escapeHtml(name)}</span>
    <span class="tr-pill ${cls}">${escapeHtml(status)}</span>
    ${detail ? `<span class="tr-detail">${escapeHtml(detail)}</span>` : ""}
  </li>`;
}
function trainsBody(t: TrainsState): string {
  const rows: string[] = [];
  if (t.shinkansen) for (const l of t.shinkansen.lines) rows.push(lineRow(l.name, l.status, l.normal, true, l.detail));
  for (const l of t.lines) rows.push(lineRow(l.name, l.status, l.normal, false, l.detail));
  return rows.length ? `<ul class="tr-list">${rows.join("")}</ul>` : `<p class="empty">路線が未設定です</p>`;
}

/* ---------------- calendar ---------------- */
function calendarBody(c: CalendarState): string {
  if (c.status === "unconfigured")
    return `<p class="empty">カレンダー未設定 — <code>npm run auth:google</code></p>`;
  if (!c.events.length) return `<p class="empty">予定はありません</p>`;
  let lastDay = "";
  return `<ul class="cal">${c.events
    .map((e) => {
      const day = dayLabel(e.start);
      const head = day !== lastDay ? `<li class="cal-day">${day}</li>` : "";
      lastDay = day;
      const time = e.allDay ? "終日" : hhmm(e.start);
      return `${head}<li class="cal-ev">
        <span class="cal-dot" style="background:${e.color ?? "#4f8cff"}"></span>
        <span class="cal-time">${time}</span>
        <span class="cal-body"><span class="cal-title">${escapeHtml(e.title)}</span>${
          e.location ? `<span class="cal-loc">${escapeHtml(e.location)}</span>` : ""
        }</span>
      </li>`;
    })
    .join("")}</ul>`;
}

/* ---------------- top bar ---------------- */
function header(state: SignageState): string {
  return `<header class="topbar" style="grid-area:header">
    <div class="loc">${escapeHtml(state.location.name)}</div>
    <div class="clock"><div class="clk-time" id="clk-time">--:--<span id="clk-sec">00</span></div>
    <div class="clk-date" id="clk-date"></div></div>
  </header>`;
}

export function render(state: SignageState): void {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    ${header(state)}
    ${card("weather", "天気 · " + escapeHtml(state.location.name), state.weather, weatherBody(state.weather))}
    ${card("spotify", "再生中", state.spotify, spotifyBody(state.spotify))}
    ${card("trains", "鉄道・新幹線", state.trains, trainsBody(state.trains))}
    ${card("bus", "遠鉄バス 接近", state.bus, busBody(state.bus))}
    ${card("calendar", "カレンダー", state.calendar, calendarBody(state.calendar))}
  `;
  updateClock();
  updateSpotifyProgress(state.spotify);
}

/* ---------------- live tickers ---------------- */
let lastSpotify: { progressMs: number; durationMs: number; isPlaying: boolean; at: number } | null =
  null;

export function updateClock(): void {
  const now = new Date();
  const t = document.getElementById("clk-time");
  const sec = document.getElementById("clk-sec");
  const date = document.getElementById("clk-date");
  if (t && sec) {
    t.firstChild && (t.firstChild.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`);
    sec.textContent = pad(now.getSeconds());
  }
  if (date) {
    const wd = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
    date.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 (${wd})`;
  }
}

export function noteSpotify(s: SpotifyState): void {
  if (s.track) {
    lastSpotify = {
      progressMs: s.track.progressMs,
      durationMs: s.track.durationMs,
      isPlaying: s.isPlaying,
      at: Date.now(),
    };
  } else {
    lastSpotify = null;
  }
}

function updateSpotifyProgress(s: SpotifyState): void {
  noteSpotify(s);
  tickSpotify();
}

export function tickSpotify(): void {
  const fill = document.getElementById("sp-fill");
  const cur = document.getElementById("sp-cur");
  const dur = document.getElementById("sp-dur");
  if (!fill || !cur || !dur || !lastSpotify) return;
  const { progressMs, durationMs, isPlaying, at } = lastSpotify;
  const elapsed = isPlaying ? progressMs + (Date.now() - at) : progressMs;
  const p = Math.min(1, durationMs > 0 ? elapsed / durationMs : 0);
  fill.style.width = `${(p * 100).toFixed(2)}%`;
  cur.textContent = fmtMs(Math.min(elapsed, durationMs));
  dur.textContent = fmtMs(durationMs);
}

function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
