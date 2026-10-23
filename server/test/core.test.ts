import assert from "node:assert/strict";
import test from "node:test";
import { signageStateSchema } from "@meural-signage/shared";
import { parseConfig } from "../src/config.js";
import { StateStore } from "../src/state.js";
import { createServer } from "../src/server.js";

function offlineConfig() {
  return parseConfig({ providers: {
    weather: { enabled: false }, spotify: { enabled: false }, entetsuBus: { enabled: false },
    trains: { enabled: false }, calendar: { enabled: false },
  } });
}

test("partial config preserves defaults and accepts documented comments", () => {
  const config = parseConfig({ $comment: "example", stream: { fps: 10 } });
  assert.equal(config.stream.fps, 10);
  assert.equal(config.stream.width, 1920);
  assert.equal(config.providers.spotify.refreshSec, 5);
});

test("config rejects invalid types, invalid ranges, typos and prototype keys", () => {
  for (const raw of [null, [], { server: { port: "7000" } }, { stream: { fps: 0 } },
    { stream: { width: 1919 } }, { providers: { weather: { refreshSec: -1 } } },
    { location: { timezone: "Invalid/Zone" } }, { server: { prot: 7000 } },
    JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.throws(() => parseConfig(raw));
  }
});

test("snapshot contract rejects malformed widget data", () => {
  const state = new StateStore(offlineConfig()).get();
  assert.equal(signageStateSchema.safeParse(state).success, true);
  assert.equal(signageStateSchema.safeParse({ ...state, weather: { status: "ok" } }).success, false);
  assert.equal(signageStateSchema.safeParse({ ...state, spotify: { ...state.spotify, isPlaying: "yes" } }).success, false);
});

test("state subscribers receive updates and can unsubscribe", () => {
  const store = new StateStore(offlineConfig());
  let calls = 0;
  const unsubscribe = store.subscribe((state) => { calls++; assert.equal(state.spotify.status, "ok"); });
  store.setSpotify({ status: "ok", fetchedAt: null, isPlaying: false, track: null });
  unsubscribe();
  store.setSpotify({ status: "disabled", fetchedAt: null, isPlaying: false, track: null });
  assert.equal(calls, 1);
});

test("HTTP snapshot, SSE updates and shutdown preserve the shared contract", async (t) => {
  const cfg = offlineConfig();
  const store = new StateStore(cfg);
  const app = await createServer(cfg, store);
  t.after(() => app.close());
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const snapshot = await fetch(`${address}/api/state`);
  assert.equal(snapshot.status, 200);
  assert.equal(signageStateSchema.safeParse(await snapshot.json()).success, true);
  const health = await fetch(`${address}/healthz`);
  assert.equal((await health.json() as { ok: boolean }).ok, true);

  const controller = new AbortController();
  const events = await fetch(`${address}/api/events`, { signal: controller.signal });
  t.after(() => controller.abort());
  assert.match(events.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = events.body!.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value);
  assert.equal(signageStateSchema.safeParse(JSON.parse(initial.slice(6))).success, true);
  store.setSpotify({ status: "ok", fetchedAt: new Date().toISOString(), isPlaying: false, track: null });
  const update = new TextDecoder().decode((await reader.read()).value);
  assert.equal(signageStateSchema.parse(JSON.parse(update.slice(6))).spotify.status, "ok");
  await app.close();
  assert.equal((await reader.read()).done, true);
});
