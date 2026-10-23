import "./style.css";
import { signageStateSchema, type SignageState } from "./types.js";
import { render, updateClock, tickSpotify } from "./render.js";
import { demoState } from "./demo.js";

const params = new URLSearchParams(location.search);
if (params.get("mode") === "stream") document.body.classList.add("stream");
const DEMO = params.get("demo") === "1";
const PORTRAIT = params.get("orient") === "portrait";
if (PORTRAIT) document.body.classList.add("portrait");

// The stage is a fixed size (1920x1080, or 1080x1920 in portrait) scaled to fit
// the window, letterboxed and centered. In the headless stream the viewport
// matches the stage so scale == 1.
const STAGE_W = PORTRAIT ? 1080 : 1920;
const STAGE_H = PORTRAIT ? 1920 : 1080;
function fit(): void {
  const app = document.getElementById("app");
  if (!app) return;
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const x = Math.round((window.innerWidth - STAGE_W * s) / 2);
  const y = Math.round((window.innerHeight - STAGE_H * s) / 2);
  app.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}
window.addEventListener("resize", fit);
fit();

let es: EventSource | null = null;
let lastEventAt = 0;
let polling = false;

function apply(state: SignageState): void {
  render(state);
}

function connect(): void {
  es?.close();
  es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    try {
      apply(signageStateSchema.parse(JSON.parse(ev.data)));
      lastEventAt = Date.now();
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => {
    // EventSource auto-reconnects; if it fully closed, retry via fetch fallback
    if (es?.readyState === EventSource.CLOSED) {
      setTimeout(connect, 3000);
    }
  };
}

// fallback: if SSE never connects, poll the snapshot
async function pollOnce(): Promise<void> {
  if (polling) return;
  polling = true;
  const startedAt = Date.now();
  try {
    const r = await fetch("/api/state", { signal: AbortSignal.timeout(8000) });
    if (r.ok && lastEventAt < startedAt) apply(signageStateSchema.parse(await r.json()));
  } catch {
    /* offline */
  } finally {
    polling = false;
  }
}

// per-second tickers for the clock and the Spotify progress bar. The progress
// anchor is set only when a new state arrives (in render), so this just advances
// it smoothly between SSE updates.
setInterval(() => {
  updateClock();
  tickSpotify();
}, 1000);

if (DEMO) {
  render(demoState());
} else {
  connect();
  // SSE primes the state. Poll only while disconnected, avoiding duplicate work
  // and a stale HTTP snapshot racing a newer live event.
  setInterval(() => { if (es?.readyState !== EventSource.OPEN) void pollOnce(); }, 15_000);
}
