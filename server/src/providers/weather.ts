import { Provider, fetchJson } from "./base.js";
import type { StateStore } from "../state.js";
import type { LocationConfig, WeatherProviderConfig } from "../config.js";
import type { WeatherDay, WeatherHour, WeatherState } from "../types.js";

// WMO weather interpretation codes -> (JP description, icon key).
// Icon keys are resolved to inline SVG in the web layer.
const WMO: Record<number, [string, string]> = {
  0: ["快晴", "clear"],
  1: ["晴れ", "mostly-clear"],
  2: ["一部くもり", "partly-cloudy"],
  3: ["くもり", "cloudy"],
  45: ["霧", "fog"],
  48: ["霧(着氷)", "fog"],
  51: ["霧雨(弱)", "drizzle"],
  53: ["霧雨", "drizzle"],
  55: ["霧雨(強)", "drizzle"],
  56: ["着氷性霧雨", "drizzle"],
  57: ["着氷性霧雨", "drizzle"],
  61: ["小雨", "rain"],
  63: ["雨", "rain"],
  65: ["大雨", "rain"],
  66: ["着氷性の雨", "rain"],
  67: ["着氷性の雨", "rain"],
  71: ["小雪", "snow"],
  73: ["雪", "snow"],
  75: ["大雪", "snow"],
  77: ["霧雪", "snow"],
  80: ["にわか雨", "showers"],
  81: ["にわか雨", "showers"],
  82: ["激しいにわか雨", "showers"],
  85: ["にわか雪", "snow"],
  86: ["にわか雪", "snow"],
  95: ["雷雨", "thunder"],
  96: ["雷雨(雹)", "thunder"],
  99: ["激しい雷雨", "thunder"],
};

function decode(code: number): [string, string] {
  return WMO[code] ?? ["—", "cloudy"];
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    is_day: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
  };
}

export class WeatherProvider extends Provider {
  readonly name = "weather";
  protected refreshSec: number;

  constructor(
    private store: StateStore,
    private loc: LocationConfig,
    cfg: WeatherProviderConfig,
  ) {
    super();
    this.refreshSec = cfg.refreshSec;
  }

  async tick(): Promise<void> {
    const prev = this.store.get().weather;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${this.loc.lat}&longitude=${this.loc.lon}` +
      `&timezone=${encodeURIComponent(this.loc.timezone)}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
      `&forecast_days=6`;

    try {
      const r = await fetchJson<OpenMeteoResponse>(url, { timeoutMs: 8000 });
      const [desc, icon] = decode(r.current.weather_code);

      // next 8 hours starting from the current hour
      const nowHour = new Date().getHours();
      const startIdx = Math.max(
        0,
        r.hourly.time.findIndex((t) => new Date(t).getHours() === nowHour),
      );
      const hourly: WeatherHour[] = [];
      for (let i = startIdx; i < Math.min(startIdx + 8, r.hourly.time.length); i++) {
        hourly.push({
          time: r.hourly.time[i]!,
          temp: Math.round(r.hourly.temperature_2m[i]!),
          code: r.hourly.weather_code[i]!,
          pop: r.hourly.precipitation_probability[i] ?? 0,
        });
      }

      const daily: WeatherDay[] = r.daily.time.slice(0, 5).map((date, i) => ({
        date,
        min: Math.round(r.daily.temperature_2m_min[i]!),
        max: Math.round(r.daily.temperature_2m_max[i]!),
        code: r.daily.weather_code[i]!,
        pop: r.daily.precipitation_probability_max[i] ?? 0,
      }));

      const next: WeatherState = {
        status: "ok",
        fetchedAt: new Date().toISOString(),
        current: {
          temp: Math.round(r.current.temperature_2m * 10) / 10,
          apparent: Math.round(r.current.apparent_temperature * 10) / 10,
          code: r.current.weather_code,
          desc,
          icon,
          windSpeed: Math.round(r.current.wind_speed_10m),
          humidity: r.current.relative_humidity_2m,
          isDay: r.current.is_day === 1,
        },
        hourly,
        daily,
      };
      this.store.setWeather(next);
    } catch (e) {
      this.store.setWeather({
        ...prev,
        status: prev.current ? "stale" : "error",
        error: (e as Error).message,
      });
      throw e;
    }
  }
}
