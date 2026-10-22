import { Provider, fetchText } from "./base.js";
import type { StateStore } from "../state.js";
import type { TrainsProviderConfig } from "../config.js";
import type { TrainLine, TrainsState } from "../types.js";

// Operation status is read from Yahoo! 路線情報 (transit.yahoo.co.jp). The
// prefecture page lists every line with a one-word status; we keep the lines
// configured by code. Covers JR Central (Tokaido Shinkansen / 本線), 遠州鉄道,
// 天竜浜名湖鉄道 etc. from one source. Polite polling only (default 120s).
const BASE = "https://transit.yahoo.co.jp/diainfo";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

interface ParsedLine {
  code: string;
  name: string;
  status: string;
  detail: string;
}

// Each row is: <a href="/diainfo/CODE/DIR">NAME</a></td><td>STATUS</td><td>DETAIL</td>
function parsePref(html: string): Map<string, ParsedLine> {
  const map = new Map<string, ParsedLine>();
  const re = /\/diainfo\/(\d+)\/\d+"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const code = m[1]!;
    if (map.has(code)) continue;
    map.set(code, {
      code,
      name: decodeEntities(m[2]!.trim()),
      status: decodeEntities(m[3]!.trim()) || "情報取得中",
      detail: decodeEntities(m[4]!.trim()),
    });
  }
  return map;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export class TrainsProvider extends Provider {
  readonly name = "trains";
  protected refreshSec: number;

  constructor(
    private store: StateStore,
    private cfg: TrainsProviderConfig,
  ) {
    super();
    this.refreshSec = cfg.refreshSec;
  }

  async tick(): Promise<void> {
    const prev = this.store.get().trains;
    try {
      const html = await fetchText(`${BASE}/pref/${this.cfg.yahooPref}`, {
        timeoutMs: 9000,
        headers: { "User-Agent": UA, "Accept-Language": "ja" },
      });
      const parsed = parsePref(html);

      const normal = (s: string) => s === "平常運転" || s === "運転再開";
      const shinkansen: TrainLine[] = [];
      const lines: TrainLine[] = [];

      for (const want of this.cfg.lines) {
        const found = parsed.get(want.code);
        const name = want.name ?? found?.name ?? `路線 ${want.code}`;
        const status = found?.status ?? "情報なし";
        const isNormal = normal(status);
        const line: TrainLine = {
          name,
          status,
          normal: isNormal,
          detail: !isNormal && found?.detail ? found.detail : undefined,
        };
        if (want.shinkansen) shinkansen.push(line);
        else lines.push(line);
      }

      const abnormal = [...shinkansen, ...lines].filter((l) => !l.normal);
      const summary =
        abnormal.length === 0
          ? "平常運転"
          : abnormal.map((l) => `${l.name}: ${l.status}`).join(" / ");

      const next: TrainsState = {
        status: "ok",
        fetchedAt: new Date().toISOString(),
        shinkansen: shinkansen.length ? { summary: shinkansen.map((l) => l.status).join(" / "), lines: shinkansen } : null,
        lines,
      };
      // keep the overall summary available via the first line detail if needed
      if (next.shinkansen) next.shinkansen.summary = summary;
      this.store.setTrains(next);
    } catch (e) {
      this.store.setTrains({
        ...prev,
        status: prev.lines.length || prev.shinkansen ? "stale" : "error",
        error: (e as Error).message,
      });
      throw e;
    }
  }
}
