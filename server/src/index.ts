import { loadConfig } from "./config.js";
import { StateStore } from "./state.js";
import { startProviders } from "./providers/index.js";
import { createServer, listen } from "./server.js";
import { SignageStreamer } from "./renderer/stream.js";
import { log } from "./log.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const wantStream = cfg.stream.enabled || process.argv.includes("--stream");

  const store = new StateStore(cfg);
  const providers = startProviders(cfg, store);

  const app = await createServer(cfg, store);
  await listen(app, cfg);

  let streamer: SignageStreamer | null = null;
  if (wantStream) {
    streamer = new SignageStreamer(cfg);
    void streamer.start().catch((e: unknown) => log("stream", "failed to start:", e));
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("main", "shutting down…");
    for (const p of providers) p.stop();
    if (streamer) await streamer.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
