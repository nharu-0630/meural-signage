import type { SignageState } from "./types.js";

// Sample state for `?demo=1` — lets you preview the fully-populated layout
// without live credentials or waiting for buses to run.
export function demoState(): SignageState {
  const now = Date.now();
  const iso = (minFromNow: number) => new Date(now + minFromNow * 60000).toISOString();
  // local YYYY-MM-DD (not UTC) so the day labels read correctly in preview
  const ymd = (daysFromNow: number) => {
    const d = new Date(now + daysFromNow * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return {
    updatedAt: new Date().toISOString(),
    location: { name: "浜松" },
    weather: {
      status: "ok",
      fetchedAt: new Date().toISOString(),
      current: { temp: 21.4, apparent: 20, code: 2, desc: "晴れ時々くもり", icon: "partly-cloudy", windSpeed: 12, humidity: 54, isDay: true },
      hourly: Array.from({ length: 8 }).map((_, i) => ({
        time: iso((i + 1) * 60),
        temp: 21 - i,
        code: [2, 2, 3, 3, 61, 61, 3, 2][i]!,
        pop: [10, 10, 20, 40, 70, 60, 30, 10][i]!,
      })),
      daily: [
        { date: ymd(0), min: 14, max: 22, code: 2, pop: 20 },
        { date: ymd(1), min: 15, max: 23, code: 61, pop: 60 },
        { date: ymd(2), min: 13, max: 20, code: 80, pop: 50 },
        { date: ymd(3), min: 12, max: 19, code: 3, pop: 30 },
        { date: ymd(4), min: 11, max: 21, code: 0, pop: 0 },
      ],
    },
    spotify: {
      status: "ok",
      fetchedAt: new Date().toISOString(),
      isPlaying: true,
      device: "Living Room",
      track: {
        title: "Weightless",
        artists: "Marconi Union",
        album: "Weightless",
        artUrl: "",
        durationMs: 8 * 60000,
        progressMs: 2 * 60000 + 14000,
      },
    },
    bus: {
      status: "ok",
      fetchedAt: new Date().toISOString(),
      stops: [
        {
          label: "浜松駅 [6]北寺島・大塚方面",
          arrivals: [
            { route: "[6]北寺島　大塚", dest: "[6]北寺島　大塚", etaMin: 1, scheduled: "14:22", status: "まもなく" },
            { route: "[6]北寺島　大塚", dest: "[6]北寺島　大塚", etaMin: 12, scheduled: "14:33", status: "接近" },
            { route: "[6]北寺島　大塚", dest: "[6]北寺島　大塚", etaMin: 24, scheduled: "14:43", status: "遅れ2分" },
          ],
        },
      ],
    },
    trains: {
      status: "ok",
      fetchedAt: new Date().toISOString(),
      shinkansen: { summary: "平常運転", lines: [{ name: "東海道新幹線", status: "平常運転", normal: true }] },
      lines: [
        { name: "東海道本線(熱海〜豊橋)", status: "遅延", normal: false, detail: "強風の影響で一部列車に遅れ" },
        { name: "遠州鉄道線", status: "平常運転", normal: true },
      ],
    },
    calendar: {
      status: "ok",
      fetchedAt: new Date().toISOString(),
      events: [
        { title: "朝会 / スタンドアップ", start: iso(60), end: iso(90), allDay: false, color: "#4f8cff" },
        { title: "歯科 定期検診", start: iso(240), end: iso(300), allDay: false, location: "浜松市中区", color: "#34c759" },
        { title: "A社 打ち合わせ", start: iso(1440 + 120), end: iso(1440 + 180), allDay: false, location: "アクトタワー", color: "#ff9f0a" },
        { title: "資料提出 締切", start: ymd(1), end: ymd(1), allDay: true, color: "#ff375f" },
        { title: "家族で夕食", start: iso(2 * 1440 + 150), end: iso(2 * 1440 + 240), allDay: false, color: "#bf5af2" },
      ],
    },
  };
}
