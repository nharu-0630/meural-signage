import { Provider, fetchJson } from "./base.js";
import type { StateStore } from "../state.js";
import type { EntetsuBusProviderConfig } from "../config.js";
import type { BusArrival, BusStop } from "../types.js";

// Official Entetsu bus-location service (hosted by NAVITIME transfer-cloud).
// Discovered endpoints (public, same JSON the bus.entetsu.co.jp site uses):
//   /apiv1/{customer}/courses/{courseId}/buses?language=ja
//     -> { buses: Bus[], destination, operatorName, updatedAt }
//   /apiv1/{customer}/courses/{courseId}/busstops?language=ja
//     -> { busstops: [{ id, name, sequence, ... }] }
const API = "https://transfer-cloud.navitime.biz/apiv1";

interface ArrivalEntry {
  id: string;
  name: string;
  sequence: number;
  scheduledArrivalTime?: string; // ISO w/ tz
  predictedArrivalTime?: string; // ISO w/ tz
  delayOfArrival?: number;
}

interface BusEntry {
  vehicleNumber?: string;
  vehicleTypes?: string[];
  arrivals?: ArrivalEntry[];
}

interface BusesResponse {
  buses: BusEntry[];
  destination: string;
  operatorName: string;
  updatedAt: string;
}

function hhmm(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
}

export class EntetsuBusProvider extends Provider {
  readonly name = "entetsu-bus";
  protected refreshSec: number;

  constructor(
    private store: StateStore,
    private cfg: EntetsuBusProviderConfig,
    private tz: string,
  ) {
    super();
    this.refreshSec = cfg.refreshSec;
  }

  private async fetchStop(
    courseId: string,
    busstopId: string | undefined,
    max: number,
  ): Promise<BusArrival[]> {
    const url = `${API}/${this.cfg.customer}/courses/${courseId}/buses?language=ja`;
    const r = await fetchJson<BusesResponse>(url, {
      timeoutMs: 8000,
      headers: { accept: "application/json" },
    });

    const now = Date.now();
    const out: BusArrival[] = [];
    for (const bus of r.buses ?? []) {
      const arrivals = bus.arrivals ?? [];
      // the arrival at the configured pole (or the bus's next stop on this course)
      const target =
        (busstopId ? arrivals.find((a) => a.id === busstopId) : undefined) ?? arrivals[0];
      if (!target) continue;
      const predictedIso = target.predictedArrivalTime ?? target.scheduledArrivalTime;
      if (!predictedIso) continue;

      const predicted = new Date(predictedIso).getTime();
      const etaMin = Math.max(0, Math.round((predicted - now) / 60000));
      let delayMin: number | null = null;
      if (target.scheduledArrivalTime && target.predictedArrivalTime) {
        delayMin = Math.round(
          (new Date(target.predictedArrivalTime).getTime() -
            new Date(target.scheduledArrivalTime).getTime()) /
            60000,
        );
      }
      const status =
        etaMin <= 1 ? "まもなく" : delayMin && delayMin > 0 ? `遅れ${delayMin}分` : "接近";

      out.push({
        route: r.destination,
        dest: r.destination,
        etaMin,
        scheduled: target.scheduledArrivalTime ? hhmm(target.scheduledArrivalTime, this.tz) : undefined,
        status,
      });
    }
    out.sort((a, b) => (a.etaMin ?? 1e9) - (b.etaMin ?? 1e9));
    return out.slice(0, max);
  }

  async tick(): Promise<void> {
    const prev = this.store.get().bus;
    if (this.cfg.stops.length === 0) {
      this.store.setBus({ status: "ok", fetchedAt: new Date().toISOString(), stops: [] });
      return;
    }
    try {
      const stops: BusStop[] = [];
      for (const s of this.cfg.stops) {
        const arrivals = await this.fetchStop(s.courseId, s.busstopId, s.max ?? 4);
        stops.push({ label: s.label, arrivals });
      }
      this.store.setBus({ status: "ok", fetchedAt: new Date().toISOString(), stops });
    } catch (e) {
      this.store.setBus({
        ...prev,
        status: prev.stops.length ? "stale" : "error",
        error: (e as Error).message,
      });
      throw e;
    }
  }
}
