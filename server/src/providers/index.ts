import type { Config } from "../config.js";
import type { StateStore } from "../state.js";
import { Provider } from "./base.js";
import { WeatherProvider } from "./weather.js";
import { SpotifyProvider } from "./spotify.js";
import { EntetsuBusProvider } from "./entetsu-bus.js";
import { TrainsProvider } from "./trains.js";
import { CalendarProvider } from "./calendar.js";
import { log } from "../log.js";

export function startProviders(cfg: Config, store: StateStore): Provider[] {
  const providers: Provider[] = [];
  const p = cfg.providers;

  if (p.weather.enabled) providers.push(new WeatherProvider(store, cfg.location, p.weather));
  if (p.spotify.enabled) providers.push(new SpotifyProvider(store, p.spotify));
  if (p.entetsuBus.enabled) providers.push(new EntetsuBusProvider(store, p.entetsuBus, cfg.location.timezone));
  if (p.trains.enabled) providers.push(new TrainsProvider(store, p.trains));
  if (p.calendar.enabled) providers.push(new CalendarProvider(store, p.calendar));

  for (const prov of providers) prov.start();
  log("providers", `started ${providers.length}: ${providers.map((x) => x.name).join(", ")}`);
  return providers;
}
