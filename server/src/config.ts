import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo root is two levels up from server/src (dev) or server/dist (build)
export const REPO_ROOT = resolve(__dirname, "..", "..");

export interface LocationConfig {
  name: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface StreamConfig {
  enabled: boolean;
  url: string;
  /** output frame size sent to the device (the Meural framebuffer is 1920x1080) */
  width: number;
  height: number;
  /** "landscape" renders 1920x1080; "portrait" renders 1080x1920 then rotates to fit */
  orientation: "landscape" | "portrait";
  /** rotation applied before the output frame (for a portrait-mounted panel) */
  rotate: "none" | "cw" | "ccw";
  fps: number;
  bitrate: string;
  gop: number;
  segmentTime: number;
  hlsDir: string;
}

export interface WeatherProviderConfig {
  enabled: boolean;
  refreshSec: number;
}

export interface SpotifyProviderConfig {
  enabled: boolean;
  refreshSec: number;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface EntetsuBusStopConfig {
  label: string;
  /** NAVITIME course id from the URL /entetsu/approachings/<courseId>/location-map */
  courseId: string;
  /** optional target busstop id on the course; defaults to the boarding pole (sequence 1) */
  busstopId?: string;
  max?: number;
}

export interface EntetsuBusProviderConfig {
  enabled: boolean;
  refreshSec: number;
  /** NAVITIME transfer-cloud customer slug (遠鉄 = "entetsu") */
  customer: string;
  stops: EntetsuBusStopConfig[];
}

export interface TrainLineConfig {
  /** Yahoo! 路線情報 diainfo line code (e.g. "7" = 東海道新幹線) */
  code: string;
  /** optional display-name override; otherwise Yahoo's name is used */
  name?: string;
  /** render under the shinkansen section */
  shinkansen?: boolean;
}

export interface TrainsProviderConfig {
  enabled: boolean;
  refreshSec: number;
  /** Yahoo! 路線情報 prefecture code (22 = 静岡) used to fetch the status table */
  yahooPref: number;
  lines: TrainLineConfig[];
}

export interface CalendarProviderConfig {
  enabled: boolean;
  refreshSec: number;
  /** path to a Google service-account key JSON; when set, used instead of OAuth */
  serviceAccountKeyFile: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarIds: string[];
  maxEvents: number;
  lookAheadDays: number;
}

export interface Config {
  location: LocationConfig;
  server: ServerConfig;
  stream: StreamConfig;
  providers: {
    weather: WeatherProviderConfig;
    spotify: SpotifyProviderConfig;
    entetsuBus: EntetsuBusProviderConfig;
    trains: TrainsProviderConfig;
    calendar: CalendarProviderConfig;
  };
}

const DEFAULTS: Config = {
  location: { name: "浜松", lat: 34.7108, lon: 137.7261, timezone: "Asia/Tokyo" },
  server: { host: "0.0.0.0", port: 7000 },
  stream: {
    enabled: false,
    url: "http://127.0.0.1:7000/",
    width: 1920,
    height: 1080,
    orientation: "landscape",
    rotate: "none",
    fps: 15,
    bitrate: "2000k",
    gop: 30,
    segmentTime: 2,
    hlsDir: "hls",
  },
  providers: {
    weather: { enabled: true, refreshSec: 600 },
    spotify: { enabled: true, refreshSec: 5, clientId: "", clientSecret: "", refreshToken: "" },
    entetsuBus: {
      enabled: true,
      refreshSec: 30,
      customer: "entetsu",
      stops: [{ label: "浜松駅 [6]北寺島・大塚方面", courseId: "0007700065", max: 3 }],
    },
    trains: {
      enabled: true,
      refreshSec: 120,
      yahooPref: 22,
      lines: [
        { code: "7", name: "東海道新幹線", shinkansen: true },
        { code: "192", name: "東海道本線(熱海〜豊橋)" },
        { code: "249", name: "遠州鉄道線" },
      ],
    },
    calendar: {
      enabled: true,
      refreshSec: 300,
      serviceAccountKeyFile: "",
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      calendarIds: ["primary"],
      maxEvents: 6,
      lookAheadDays: 7,
    },
  },
};

// shallow+one-level merge is enough for our flat-ish config
function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || typeof override !== "object" || Array.isArray(override)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (k.startsWith("$")) continue; // skip $comment etc.
    const b = (base as Record<string, unknown>)[k];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      out[k] = deepMerge(b, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function applyEnv(cfg: Config): Config {
  const env = process.env;
  if (env.PORT) cfg.server.port = Number(env.PORT);
  if (env.HOST) cfg.server.host = env.HOST;

  if (env.SPOTIFY_CLIENT_ID) cfg.providers.spotify.clientId = env.SPOTIFY_CLIENT_ID;
  if (env.SPOTIFY_CLIENT_SECRET) cfg.providers.spotify.clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (env.SPOTIFY_REFRESH_TOKEN) cfg.providers.spotify.refreshToken = env.SPOTIFY_REFRESH_TOKEN;

  if (env.GOOGLE_CLIENT_ID) cfg.providers.calendar.clientId = env.GOOGLE_CLIENT_ID;
  if (env.GOOGLE_CLIENT_SECRET) cfg.providers.calendar.clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (env.GOOGLE_REFRESH_TOKEN) cfg.providers.calendar.refreshToken = env.GOOGLE_REFRESH_TOKEN;
  if (env.GOOGLE_SA_KEY_FILE) cfg.providers.calendar.serviceAccountKeyFile = env.GOOGLE_SA_KEY_FILE;

  if (env.MEURAL_SIGNAGE_STREAM === "1") cfg.stream.enabled = true;
  return cfg;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  let merged: Config = structuredClone(DEFAULTS);
  const path = process.env.CONFIG_PATH
    ? resolve(process.env.CONFIG_PATH)
    : resolve(REPO_ROOT, "config.json");
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      merged = deepMerge(merged, raw);
    } catch (e) {
      console.error(`[config] failed to parse ${path}:`, (e as Error).message);
    }
  } else {
    console.warn(`[config] ${path} not found — using defaults + env. Copy config.example.json to config.json.`);
  }
  cached = applyEnv(merged);
  return cached;
}
