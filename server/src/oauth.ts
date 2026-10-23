import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fetchJson } from "./providers/base.js";

/**
 * OAuth2 refresh-token helpers for Spotify and Google. We never store or need
 * the user's password; a one-time `pnpm auth:*` produces a long-lived
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

// ---- Google service-account (JWT-bearer) auth ----
// For headless access: a service account reads a calendar that has been shared
// with its email. No interactive consent, no refresh token, no 7-day expiry.

interface SAKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const saKeyCache = new Map<string, SAKey>();

function loadSAKey(keyFile: string): SAKey {
  const hit = saKeyCache.get(keyFile);
  if (hit) return hit;
  const parsed = JSON.parse(readFileSync(keyFile, "utf8")) as SAKey;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`service account key ${keyFile} missing client_email/private_key`);
  }
  saKeyCache.set(keyFile, parsed);
  return parsed;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function googleServiceAccountToken(keyFile: string, scope: string): Promise<string> {
  const key = loadSAKey(keyFile);
  const cacheKey = `sa:${key.client_email}:${scope}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now + 30_000) return hit.accessToken;

  const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const iat = Math.floor(now / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: key.client_email,
    scope,
    aud: tokenUri,
    iat,
    exp: iat + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(key.private_key);
  const assertion = `${signingInput}.${b64url(signature)}`;

  const res = await fetchJson<{ access_token: string; expires_in: number }>(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  cache.set(cacheKey, { accessToken: res.access_token, expiresAt: now + res.expires_in * 1000 });
  return res.access_token;
}
