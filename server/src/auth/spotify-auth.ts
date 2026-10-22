import "dotenv/config";
import { AUTH_PORT, openBrowser, requireEnv, waitForCode } from "./cli-util.js";

// One-time helper: obtain a Spotify refresh token for the now-playing widget.
//   npm run auth:spotify   (from the repo root, with SPOTIFY_CLIENT_ID/SECRET set)
const CALLBACK = "/auth/spotify/callback";
const SCOPES = ["user-read-playback-state", "user-read-currently-playing"].join(" ");

async function main(): Promise<void> {
  const env = requireEnv("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET");
  const redirectUri = `http://127.0.0.1:${AUTH_PORT}${CALLBACK}`;

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: env.SPOTIFY_CLIENT_ID!,
      scope: SCOPES,
      redirect_uri: redirectUri,
    }).toString();

  console.log("\n1) Spotify Dashboard のアプリに次の Redirect URI を登録してください:");
  console.log(`   ${redirectUri}`);
  console.log("\n2) ブラウザで認可します（自動で開きます。開かない場合は下記URLを開いてください）:");
  console.log(`   ${authUrl}\n`);
  openBrowser(authUrl);

  const code = await waitForCode(CALLBACK);

  const basic = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
  });
  if (!res.ok) {
    console.error("token exchange failed:", res.status, await res.text());
    process.exit(1);
  }
  const tok = (await res.json()) as { refresh_token: string };
  console.log("\n✅ 取得しました。これを .env に貼り付けてください:\n");
  console.log(`SPOTIFY_REFRESH_TOKEN=${tok.refresh_token}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
