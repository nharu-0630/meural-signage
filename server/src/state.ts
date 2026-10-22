import { EventEmitter } from "node:events";
import type { Config } from "./config.js";
import {
  emptyMeta,
  type SignageState,
  type WeatherState,
  type SpotifyState,
  type BusState,
  type TrainsState,
  type CalendarState,
} from "./types.js";

type WidgetKey = "weather" | "spotify" | "bus" | "trains" | "calendar";

/**
 * Single source of truth for the current signage state. Providers push partial
 * widget updates; subscribers (SSE clients, the initial /api/state) read it.
 */
export class StateStore {
  private state: SignageState;
  private emitter = new EventEmitter();

  constructor(cfg: Config) {
    this.emitter.setMaxListeners(0);
    const now = new Date().toISOString();
    this.state = {
      updatedAt: now,
      location: { name: cfg.location.name },
      weather: { ...emptyMeta(cfg.providers.weather.enabled ? "error" : "disabled"), current: null, hourly: [], daily: [] },
      spotify: { ...emptyMeta(cfg.providers.spotify.enabled ? "error" : "disabled"), isPlaying: false, track: null },
      bus: { ...emptyMeta(cfg.providers.entetsuBus.enabled ? "error" : "disabled"), stops: [] },
      trains: { ...emptyMeta(cfg.providers.trains.enabled ? "error" : "disabled"), shinkansen: null, lines: [] },
      calendar: { ...emptyMeta(cfg.providers.calendar.enabled ? "error" : "disabled"), events: [] },
    };
  }

  get(): SignageState {
    return this.state;
  }

  setWeather(w: WeatherState): void {
    this.state.weather = w;
    this.bump();
  }
  setSpotify(s: SpotifyState): void {
    this.state.spotify = s;
    this.bump();
  }
  setBus(b: BusState): void {
    this.state.bus = b;
    this.bump();
  }
  setTrains(t: TrainsState): void {
    this.state.trains = t;
    this.bump();
  }
  setCalendar(c: CalendarState): void {
    this.state.calendar = c;
    this.bump();
  }

  private bump(): void {
    this.state.updatedAt = new Date().toISOString();
    this.emitter.emit("update", this.state);
  }

  subscribe(fn: (s: SignageState) => void): () => void {
    this.emitter.on("update", fn);
    return () => this.emitter.off("update", fn);
  }

  // helper for providers to only touch a sub-slice
  which(key: WidgetKey): WidgetKey {
    return key;
  }
}
