// Mirror of server/src/types.ts (keep in sync).

export type WidgetStatus = "ok" | "stale" | "error" | "disabled" | "unconfigured";

export interface WidgetMeta {
  status: WidgetStatus;
  fetchedAt: string | null;
  error?: string;
}

export interface WeatherCurrent {
  temp: number;
  apparent: number;
  code: number;
  desc: string;
  icon: string;
  windSpeed: number;
  humidity: number;
  isDay: boolean;
}

export interface WeatherHour {
  time: string;
  temp: number;
  code: number;
  pop: number;
}

export interface WeatherDay {
  date: string;
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
  route: string;
  dest: string;
  etaMin: number | null;
  scheduled?: string;
  status?: string;
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
  status: string;
  detail?: string;
  normal: boolean;
}

export interface TrainsState extends WidgetMeta {
  shinkansen: { summary: string; lines: TrainLine[] } | null;
  lines: TrainLine[];
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
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
