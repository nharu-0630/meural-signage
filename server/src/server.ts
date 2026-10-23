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
  const clients = new Set<import("node:http").ServerResponse>();
  // Serialize once per state update, regardless of the number of viewers.
  const unsubscribe = store.subscribe((state) => {
    const data = `data: ${JSON.stringify(state)}\n\n`;
    for (const client of clients) {
      if (client.destroyed || client.writableNeedDrain) client.destroy();
      else client.write(data);
    }
  });
  const keepAlive = setInterval(() => {
    for (const client of clients) {
      if (client.destroyed || client.writableNeedDrain) client.destroy();
      else client.write(": keep-alive\n\n");
    }
  }, 15_000);
  keepAlive.unref();
  app.addHook("onClose", async () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
  // Close endless SSE responses before Fastify waits for active connections.
  app.addHook("preClose", async () => {
    for (const client of clients) client.end();
    clients.clear();
  });
  app.get("/api/events", (_req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    clients.add(reply.raw);
    reply.raw.once("close", () => clients.delete(reply.raw));
    reply.raw.write(`data: ${JSON.stringify(store.get())}\n\n`);
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
    warn("server", `web build not found at ${webDist}. Run \`pnpm build\`. Serving a placeholder.`);
    app.get("/", async (_req, reply) => {
      reply.type("text/html").send(
        `<!doctype html><meta charset=utf-8><body style="background:#111;color:#eee;font-family:sans-serif;padding:3rem">
         <h1>meural-signage</h1><p>Frontend not built yet. Run <code>pnpm build</code> (or <code>pnpm dev</code> for the Vite dev server on :5173).</p>
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
