import { Provider } from "./base.js";
import type { StateStore } from "../state.js";
import type { SpotifyProviderConfig } from "../config.js";
import type { SpotifyState } from "../types.js";
import { spotifyAccessToken } from "../oauth.js";

interface SpotifyPlayer {
  is_playing: boolean;
  progress_ms: number | null;
  device?: { name: string };
  item: {
    name: string;
    duration_ms: number;
    album: { name: string; images: { url: string; width: number }[] };
    artists: { name: string }[];
  } | null;
}

export class SpotifyProvider extends Provider {
  readonly name = "spotify";
  protected refreshSec: number;
  private configured: boolean;

  constructor(
    private store: StateStore,
    private cfg: SpotifyProviderConfig,
  ) {
    super();
    this.refreshSec = cfg.refreshSec;
    this.configured = Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
  }

  async tick(): Promise<void> {
    if (!this.configured) {
      const cur = this.store.get().spotify;
      if (cur.status !== "unconfigured") {
        this.store.setSpotify({
          status: "unconfigured",
          fetchedAt: null,
          isPlaying: false,
          track: null,
          error: "Spotify credentials not set",
        });
      }
      return;
    }

    const prev = this.store.get().spotify;
    try {
      const token = await spotifyAccessToken(this.cfg.clientId, this.cfg.clientSecret, this.cfg.refreshToken);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      let player: SpotifyPlayer | null;
      try {
        const res = await fetch("https://api.spotify.com/v1/me/player?additional_types=track", {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (res.status === 204) {
          player = null; // nothing active
        } else if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        } else {
          player = (await res.json()) as SpotifyPlayer;
        }
      } finally {
        clearTimeout(to);
      }

      const now = new Date().toISOString();
      if (!player || !player.item) {
        this.store.setSpotify({ status: "ok", fetchedAt: now, isPlaying: false, track: null, device: player?.device?.name });
        return;
      }

      const art = [...player.item.album.images].sort((a, b) => b.width - a.width)[0]?.url;
      const next: SpotifyState = {
        status: "ok",
        fetchedAt: now,
        isPlaying: player.is_playing,
        device: player.device?.name,
        track: {
          title: player.item.name,
          artists: player.item.artists.map((a) => a.name).join(", "),
          album: player.item.album.name,
          artUrl: art,
          durationMs: player.item.duration_ms,
          progressMs: player.progress_ms ?? 0,
        },
      };
      this.store.setSpotify(next);
    } catch (e) {
      this.store.setSpotify({
        ...prev,
        status: prev.track ? "stale" : "error",
        error: (e as Error).message,
      });
      throw e;
    }
  }
}
