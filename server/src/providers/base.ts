import { log, err } from "../log.js";

/**
 * A provider periodically fetches from one upstream and writes a widget slice
 * into the StateStore. Base class handles the refresh loop, jitter, and
 * crash isolation so one failing provider never takes down the others.
 */
export abstract class Provider {
  abstract readonly name: string;
  protected abstract refreshSec: number;

  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  /** Fetch once and write the result into the store. Must not throw. */
  abstract tick(): Promise<void>;

  start(): void {
    this.stopped = false;
    const run = async () => {
      if (this.stopped) return;
      const t0 = Date.now();
      try {
        await this.tick();
      } catch (e) {
        err(this.name, (e as Error).message);
      }
      if (this.stopped) return;
      // small jitter avoids all providers firing on the same tick
      const jitter = Math.floor(Math.random() * 500);
      const wait = Math.max(1000, this.refreshSec * 1000 - (Date.now() - t0)) + jitter;
      this.timer = setTimeout(run, wait);
    };
    log(this.name, `starting, every ${this.refreshSec}s`);
    void run();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** fetch() with a timeout and JSON parsing. Throws on non-2xx. */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 10_000, ...rest } = init;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(to);
  }
}

export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 10_000, ...rest } = init;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(to);
  }
}
