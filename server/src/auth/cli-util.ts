import http from "node:http";
import { URL } from "node:url";
import { spawn } from "node:child_process";

export const AUTH_PORT = Number(process.env.AUTH_PORT ?? 7000);

/** Best-effort open of a URL in the user's default browser. */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    /* ignore — the URL is printed anyway */
  }
}

/**
 * Runs a one-shot authorization-code flow: prints/opens the auth URL, spins a
 * localhost server to catch the redirect, and returns the `code`.
 */
export function waitForCode(callbackPath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", `http://127.0.0.1:${AUTH_PORT}`);
      if (u.pathname !== callbackPath) {
        res.writeHead(404).end("not found");
        return;
      }
      const code = u.searchParams.get("code");
      const error = u.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;background:#111;color:#eee;padding:3rem">
         <h2>${error ? "認可に失敗しました" : "認可が完了しました"}</h2>
         <p>${error ? error : "このタブを閉じてターミナルに戻ってください。"}</p></body>`,
      );
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolvePromise(code);
      else reject(new Error("no code in callback"));
    });
    server.listen(AUTH_PORT, () => {
      /* ready */
    });
    server.on("error", reject);
  });
}

export function requireEnv(...names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = process.env[n];
    if (!v) missing.push(n);
    else out[n] = v;
  }
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}. Set them in .env or the shell first.`);
    process.exit(1);
  }
  return out;
}
