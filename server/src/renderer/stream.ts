import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Config } from "../config.js";
import { REPO_ROOT } from "../config.js";
import { log, err, warn } from "../log.js";

/**
 * Renders the signage page in headless Chromium and produces a live HLS stream
 * at <hlsDir>/live.m3u8 (served by the server at /hls/live.m3u8).
 *
 * Pipeline:  Chromium CDP screencast (JPEG) --> a constant-rate writer -->
 *            ffmpeg (image2pipe) --> libx264 --> HLS (2s MPEG-TS segments).
 *
 * meural-hls then consumes it:
 *   HLS_URL=http://127.0.0.1:<port>/hls/live.m3u8 python3 mac/hls_push.py
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
  private stopped = false;

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

  private buildFfmpegArgs(dir: string): string[] {
    const s = this.cfg.stream;
    return [
      "-hide_banner",
      "-loglevel", "warning",
      "-f", "image2pipe",
      "-framerate", String(s.fps),
      "-i", "-",
      "-vf", `fps=${s.fps},scale=${s.width}:${s.height},format=yuv420p`,
      "-c:v", "libx264",
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
    const s = this.cfg.stream;
    const dir = this.hlsDir();
    this.cleanHls(dir);

    log("stream", "launching headless chromium…");
    this.browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
        "--disable-dev-shm-usage",
        `--window-size=${s.width},${s.height}`,
      ],
    });
    const ctx = await this.browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
    });
    this.page = await ctx.newPage();
    const url = s.url.replace(/\/$/, "") + "/?mode=stream";
    log("stream", `opening ${url}`);
    await this.page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch((e) => {
      warn("stream", `initial goto: ${(e as Error).message}`);
    });

    log("stream", "starting ffmpeg → HLS");
    this.ffmpeg = spawn("ffmpeg", this.buildFfmpegArgs(dir));
    this.ffmpeg.stderr.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) warn("ffmpeg", line.split("\n").slice(-1)[0]);
    });
    this.ffmpeg.on("exit", (code) => {
      err("stream", `ffmpeg exited (${code})`);
      if (!this.stopped) void this.restart();
    });

    // CDP screencast → lastFrame
    const client = await this.page.context().newCDPSession(this.page);
    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 80,
      maxWidth: s.width,
      maxHeight: s.height,
      everyNthFrame: 1,
    });
    client.on("Page.screencastFrame", async (frame) => {
      this.lastFrame = Buffer.from(frame.data, "base64");
      try {
        await client.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
      } catch {
        /* page gone */
      }
    });

    // constant-rate writer: feed ffmpeg one frame per 1/fps regardless of page activity
    const interval = Math.round(1000 / s.fps);
    this.ticker = setInterval(() => {
      if (this.lastFrame && this.ffmpeg?.stdin.writable) {
        this.ffmpeg.stdin.write(this.lastFrame);
      }
    }, interval);

    log("stream", `streaming ${s.width}x${s.height}@${s.fps} → /hls/live.m3u8`);
  }

  private async restart(): Promise<void> {
    warn("stream", "restarting pipeline in 3s…");
    await this.stop();
    this.stopped = false;
    setTimeout(() => void this.start(), 3000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.stdin.end();
        this.ffmpeg.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.ffmpeg = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
