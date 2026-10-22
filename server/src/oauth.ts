import { fetchJson } from "./providers/base.js";

/**
 * OAuth2 refresh-token helpers for Spotify and Google. We never store or need
 * the user's password; a one-time `npm run auth:*` produces a long-lived
 * refresh token that the provider swaps for short-lived access tokens here.
 */

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const cache = new Map<string, TokenCacheEntry>();

async function refresh(
  key: string,
  tokenUrl: string,
  body: URLSearchParams,
  authHeader?: string,
): Promise<string> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now + 30_000) return hit.accessToken;

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (authHeader) headers["Authorization"] = authHeader;

  const res = await fetchJson<{ access_token: string; expires_in: number }>(tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  const entry: TokenCacheEntry = {
    accessToken: res.access_token,
    expiresAt: now + res.expires_in * 1000,
  };
  cache.set(key, entry);
  return entry.accessToken;
}

export function spotifyAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return refresh(`spotify:${clientId}`, "https://accounts.spotify.com/api/token", body, `Basic ${basic}`);
}

export function googleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  return refresh(`google:${clientId}`, "https://oauth2.googleapis.com/token", body);
}
