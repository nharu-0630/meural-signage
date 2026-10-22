// Canonical data model shared (by copy) with web/src/types.ts.
// When you change a widget shape here, mirror it there.

export type WidgetStatus =
  | "ok" // fresh data
  | "stale" // last fetch failed but we have older data
  | "error" // never succeeded
  | "disabled" // turned off in config
  | "unconfigured"; // enabled but missing credentials

export interface WidgetMeta {
  status: WidgetStatus;
  fetchedAt: string | null; // ISO of last successful fetch
  error?: string;
}

export interface WeatherCurrent {
  temp: number;
  apparent: number;
  code: number;
  desc: string;
  icon: string; // emoji-free key, resolved to an icon in the UI
  windSpeed: number;
  humidity: number;
  isDay: boolean;
}

export interface WeatherHour {
  time: string; // ISO
  temp: number;
  code: number;
  pop: number; // precipitation probability %
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  min: number;
  max: number;
  code: number;
  pop: number;
}

export interface WeatherState extends WidgetMeta {
  current: WeatherCurrent | null;
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export interface SpotifyTrack {
  title: string;
  artists: string;
  album: string;
  artUrl?: string;
  durationMs: number;
  progressMs: number;
}

export interface SpotifyState extends WidgetMeta {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  device?: string;
}

export interface BusArrival {
  route: string; // 系統/行先表示
  dest: string;
  etaMin: number | null; // minutes until arrival, null if unknown
  scheduled?: string; // HH:MM
  status?: string; // e.g. "接近", "まもなく", "遅れ5分"
}

export interface BusStop {
  label: string;
  arrivals: BusArrival[];
}

export interface BusState extends WidgetMeta {
  stops: BusStop[];
}

export interface TrainLine {
  name: string;
  status: string; // 平常運転 / 遅延 / 運転見合わせ ...
  detail?: string;
  normal: boolean;
}

export interface TrainsState extends WidgetMeta {
  shinkansen: { summary: string; lines: TrainLine[] } | null;
  lines: TrainLine[];
}

export interface CalendarEvent {
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location?: string;
  calendar?: string;
  color?: string;
}

export interface CalendarState extends WidgetMeta {
  events: CalendarEvent[];
}

export interface SignageState {
  updatedAt: string;
  location: { name: string };
  weather: WeatherState;
  spotify: SpotifyState;
  bus: BusState;
  trains: TrainsState;
  calendar: CalendarState;
}

export function emptyMeta(status: WidgetStatus): WidgetMeta {
  return { status, fetchedAt: null };
}
