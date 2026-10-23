import { Provider, fetchJson } from "./base.js";
import type { StateStore } from "../state.js";
import type { CalendarProviderConfig } from "../config.js";
import type { CalendarEvent } from "../types.js";
import { googleAccessToken, googleServiceAccountToken } from "../oauth.js";

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

interface GEvent {
  summary?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface GEventsResponse {
  items: GEvent[];
}

// a small fixed palette so each configured calendar gets a stable accent color
const PALETTE = ["#4f8cff", "#34c759", "#ff9f0a", "#ff375f", "#bf5af2", "#5ac8fa"];

export class CalendarProvider extends Provider {
  readonly name = "calendar";
  protected refreshSec: number;
  private useServiceAccount: boolean;
  private configured: boolean;

  constructor(
    private store: StateStore,
    private cfg: CalendarProviderConfig,
  ) {
    super();
    this.refreshSec = cfg.refreshSec;
    this.useServiceAccount = Boolean(cfg.serviceAccountKeyFile);
    this.configured =
      this.useServiceAccount || Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
  }

  private token(): Promise<string> {
    return this.useServiceAccount
      ? googleServiceAccountToken(this.cfg.serviceAccountKeyFile, CAL_SCOPE)
      : googleAccessToken(this.cfg.clientId, this.cfg.clientSecret, this.cfg.refreshToken);
  }

  async tick(): Promise<void> {
    if (!this.configured) {
      const cur = this.store.get().calendar;
      if (cur.status !== "unconfigured") {
        this.store.setCalendar({
          status: "unconfigured",
          fetchedAt: null,
          events: [],
          error: "Set serviceAccountKeyFile (+ share calendar) or OAuth credentials",
        });
      }
      return;
    }

    const prev = this.store.get().calendar;
    try {
      const token = await this.token();
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + this.cfg.lookAheadDays * 86400_000).toISOString();

      const all: CalendarEvent[] = [];
      for (let i = 0; i < this.cfg.calendarIds.length; i++) {
        const calId = this.cfg.calendarIds[i]!;
        const url =
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events` +
          `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
          `&singleEvents=true&orderBy=startTime&maxResults=20`;
        const r = await fetchJson<GEventsResponse>(url, {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 9000,
        });
        const color = PALETTE[i % PALETTE.length];
        for (const ev of r.items ?? []) {
          const allDay = Boolean(ev.start.date);
          all.push({
            title: ev.summary ?? "(無題)",
            start: ev.start.dateTime ?? ev.start.date ?? "",
            end: ev.end.dateTime ?? ev.end.date ?? "",
            allDay,
            location: ev.location,
            calendar: calId === "primary" ? undefined : calId,
            color,
          });
        }
      }

      all.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      this.store.setCalendar({
        status: "ok",
        fetchedAt: new Date().toISOString(),
        events: all.slice(0, this.cfg.maxEvents),
      });
    } catch (e) {
      this.store.setCalendar({
        ...prev,
        status: prev.events.length ? "stale" : "error",
        error: (e as Error).message,
      });
      throw e;
    }
  }
}
