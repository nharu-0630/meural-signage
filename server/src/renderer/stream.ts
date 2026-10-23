import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Config } from "../config.js";
import { REPO_ROOT } from "../config.js";
import { log, warn } from "../log.js";

/**
 * Renders the signage page in headless Chromium and produces a live HLS stream
 * at <hlsDir>/live.m3u8 (served by the server at /hls/live.m3u8).
 *
 * Pipeline:  Chromium CDP screencast (JPEG) --> a constant-rate writer -->
 *            ffmpeg (image2pipe) --> libx264 --> HLS (2s MPEG-TS segments).
 *
 * meural-hls then consumes it:
 *   HLS_URL=http://127.0.0.1:<port>/hls/live.m3u8 uv run python mac/hls_push.py
 *
 * The constant-rate writer repeats the most recent frame every 1/fps seconds so
 * ffmpeg always gets CFR input even when the page is visually idle — this keeps
 * the downstream player (and meural-hls's real-time drip) from starving.
 */
export class SignageStreamer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private ffmpeg: ChildProcessWithoutNullStreams | null = null;
  private lastFrame: Buffer | null = null;
  private ticker: NodeJS.Timeout | null = null;
  private stopped = true;
  private starting: Promise<void> | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private restarting = false;
  private cleaning: Promise<void> | null = null;
  private readonly handleFailure = () => { if (!this.stopped) void this.restart(); };

  constructor(private cfg: Config) {}

  private hlsDir(): string {
    const dir = resolve(REPO_ROOT, this.cfg.stream.hlsDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  private cleanHls(dir: string): void {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".ts") || f.endsWith(".m3u8")) {
        try {
          unlinkSync(resolve(dir, f));
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Portrait renders a tall page; everything else keeps the configured size. */
  private renderSize(): { w: number; h: number } {
    return this.cfg.stream.orientation === "portrait"
      ? { w: 1080, h: 1920 }
      : { w: this.cfg.stream.width, h: this.cfg.stream.height };
  }

  private videoFilter(): string {
    const s = this.cfg.stream;
    // for a portrait-mounted panel, rotate the tall render onto the landscape
    // framebuffer; default to a 90° CW turn when portrait with no explicit rotate.
    let rot = s.rotate;
    if (s.orientation === "portrait" && rot === "none") rot = "cw";
    const transpose = rot === "cw" ? "transpose=1," : rot === "ccw" ? "transpose=2," : "";
    return `fps=${s.fps},${transpose}scale=${s.width}:${s.height}:out_range=tv,format=yuv420p`;
  }

  private buildFfmpegArgs(dir: string): string[] {
    const s = this.cfg.stream;
    return [
      "-hide_banner",
      "-loglevel", "warning",
      "-f", "image2pipe",
      "-framerate", String(s.fps),
      "-i", "-",
      "-vf", this.videoFilter(),
      "-c:v", "libx264",
      "-color_range", "tv",
      "-preset", "veryfast",
      "-tune", "zerolatency",
      "-b:v", s.bitrate,
      "-maxrate", s.bitrate,
      "-bufsize", "4M",
      "-g", String(s.gop),
      "-an",
      "-f", "hls",
      "-hls_time", String(s.segmentTime),
      "-hls_list_size", "6",
      "-hls_flags", "delete_segments+append_list+omit_endlist",
      "-hls_segment_type", "mpegts",
      "-hls_segment_filename", resolve(dir, "seg_%05d.ts"),
      resolve(dir, "live.m3u8"),
    ];
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    if (!this.stopped) return;
    this.stopped = false;
    const task = this.startPipeline();
    this.starting = task;
    try {
      await task;
    } catch (e) {
      this.stopped = true;
      await this.cleanup();
      throw e;
    } finally {
      this.starting = null;
    }
  }

  private async startPipeline(): Promise<void> {
    const s = this.cfg.stream;
    const dir = this.hlsDir();
    this.cleanHls(dir);
    const { w: rw, h: rh } = this.renderSize();
    log("stream", `launching headless chromium (${rw}x${rh}, ${s.orientation})…`);
    this.browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage", `--window-size=${rw},${rh}`],
    });
    if (this.stopped) return;
    const ctx = await this.browser.newContext({
      viewport: { width: rw, height: rh }, deviceScaleFactor: 1,
      timezoneId: this.cfg.location.timezone, reducedMotion: "no-preference",
    });
    if (this.stopped) return;
    this.page = await ctx.newPage();
    const url = new URL(s.url);
    url.searchParams.set("mode", "stream");
    if (s.orientation === "portrait") url.searchParams.set("orient", "portrait");
    // SSE stays open indefinitely; navigation readiness must not wait for idle networking.
    await this.page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.page.waitForSelector(".topbar", { timeout: 30_000 });
    if (this.stopped) return;

    const encoder = spawn("ffmpeg", this.buildFfmpegArgs(dir));
    this.ffmpeg = encoder;
    encoder.stdout.resume();
    encoder.stderr.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) warn("ffmpeg", line.split("\n").at(-1));
    });
    encoder.on("error", (e) => { warn("stream", e.message); this.handleFailure(); });
    encoder.stdin.on("error", (e) => { warn("stream", e.message); this.handleFailure(); });
    encoder.on("exit", this.handleFailure);
    this.browser.on("disconnected", this.handleFailure);

    const client = await this.page.context().newCDPSession(this.page);
    client.on("Page.screencastFrame", (frame) => {
      this.lastFrame = Buffer.from(frame.data, "base64");
      void client.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    });
    await client.send("Page.startScreencast", {
      format: "jpeg", quality: 80, maxWidth: rw, maxHeight: rh, everyNthFrame: 1,
    });
    if (this.stopped) return;
    this.ticker = setInterval(() => {
      // write(false) means the frame was accepted but the pipe is full. Skip
      // ticks until it drains, retaining only the newest CDP frame in memory.
      if (this.lastFrame && encoder.stdin.writable && !encoder.stdin.destroyed && !encoder.stdin.writableNeedDrain) {
        encoder.stdin.write(this.lastFrame);
      }
    }, 1000 / s.fps);
    log("stream", `streaming ${s.width}x${s.height}@${s.fps} → /hls/live.m3u8`);
  }

  private async restart(): Promise<void> {
    if (this.restarting || this.stopped) return;
    this.restarting = true;
    // Finish startup before disposing its resources.
    await this.starting?.catch(() => {});
    if (this.stopped) { this.restarting = false; return; }
    await this.cleanup();
    this.restarting = false;
    if (this.stopped) return;
    warn("stream", "restarting pipeline in 3s…");
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopped) return;
      this.stopped = true;
      void this.start().catch((e: unknown) => {
        warn("stream", "restart failed", e);
      });
    }, 3000);
  }

  private async cleanup(): Promise<void> {
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.dispose();
    try { await this.cleaning; } finally { this.cleaning = null; }
  }

  private async dispose(): Promise<void> {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.lastFrame = null;
    const encoder = this.ffmpeg;
    this.ffmpeg = null;
    if (encoder) {
      encoder.off("exit", this.handleFailure);
      encoder.stdin.destroy();
      encoder.kill("SIGTERM");
      if (encoder.exitCode === null && encoder.signalCode === null) {
        await new Promise<void>((resolveExit) => {
          const timeout = setTimeout(() => { encoder.kill("SIGKILL"); resolveExit(); }, 3000);
          encoder.once("close", () => { clearTimeout(timeout); resolveExit(); });
        });
      }
    }
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (browser) {
      browser.off("disconnected", this.handleFailure);
      await browser.close().catch(() => {});
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    await this.starting?.catch(() => {});
    await this.cleanup();
  }
}
