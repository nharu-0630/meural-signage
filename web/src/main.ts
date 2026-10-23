import "./style.css";
import type { SignageState } from "./types.js";
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

function apply(state: SignageState): void {
  render(state);
}

function connect(): void {
  es?.close();
  es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    try {
      apply(JSON.parse(ev.data) as SignageState);
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
  try {
    const r = await fetch("/api/state");
    if (r.ok) apply((await r.json()) as SignageState);
  } catch {
    /* offline */
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
  void pollOnce();
  connect();
}
