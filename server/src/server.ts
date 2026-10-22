import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import { REPO_ROOT } from "./config.js";
import type { StateStore } from "./state.js";
import { log, warn } from "./log.js";

export async function createServer(cfg: Config, store: StateStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // --- API: current snapshot ---
  app.get("/api/state", async () => store.get());

  app.get("/healthz", async () => ({ ok: true, updatedAt: store.get().updatedAt }));

  // --- API: live updates over Server-Sent Events ---
  app.get("/api/events", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (s: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(s)}\n\n`);
    };
    send(store.get()); // prime with the current state
    const unsub = store.subscribe(send);
    const ka = setInterval(() => reply.raw.write(": keep-alive\n\n"), 15_000);
    req.raw.on("close", () => {
      clearInterval(ka);
      unsub();
    });
  });

  // --- HLS output (populated by the renderer when streaming is enabled) ---
  const hlsDir = resolve(REPO_ROOT, cfg.stream.hlsDir);
  if (!existsSync(hlsDir)) mkdirSync(hlsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: hlsDir,
    prefix: "/hls/",
    decorateReply: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  });

  // --- static signage frontend (Vite build output) ---
  const webDist = resolve(REPO_ROOT, "web", "dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/" });
  } else {
    warn("server", `web build not found at ${webDist}. Run \`npm run build\`. Serving a placeholder.`);
    app.get("/", async (_req, reply) => {
      reply.type("text/html").send(
        `<!doctype html><meta charset=utf-8><body style="background:#111;color:#eee;font-family:sans-serif;padding:3rem">
         <h1>meural-signage</h1><p>Frontend not built yet. Run <code>npm run build</code> (or <code>npm run dev</code> for the Vite dev server on :5173).</p>
         <p>API is live: <a style="color:#4f8cff" href="/api/state">/api/state</a></p></body>`,
      );
    });
  }

  return app;
}

export async function listen(app: FastifyInstance, cfg: Config): Promise<void> {
  await app.listen({ host: cfg.server.host, port: cfg.server.port });
  log("server", `listening on http://${cfg.server.host}:${cfg.server.port}`);
}
