import "dotenv/config";
import { AUTH_PORT, openBrowser, requireEnv, waitForCode } from "./cli-util.js";

// One-time helper: obtain a Google refresh token for the Calendar widget.
//   npm run auth:google   (with GOOGLE_CLIENT_ID/SECRET set)
const CALLBACK = "/auth/google/callback";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

async function main(): Promise<void> {
  const env = requireEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  const redirectUri = `http://127.0.0.1:${AUTH_PORT}${CALLBACK}`;

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
    }).toString();

  console.log("\n1) Google Cloud Console の OAuth クライアントに次の Redirect URI を登録してください:");
  console.log(`   ${redirectUri}`);
  console.log("\n2) ブラウザで認可します（自動で開きます。開かない場合は下記URLを開いてください）:");
  console.log(`   ${authUrl}\n`);
  openBrowser(authUrl);

  const code = await waitForCode(CALLBACK);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    console.error("token exchange failed:", res.status, await res.text());
    process.exit(1);
  }
  const tok = (await res.json()) as { refresh_token?: string };
  if (!tok.refresh_token) {
    console.error("No refresh_token returned. Revoke prior access and retry (prompt=consent).");
    process.exit(1);
  }
  console.log("\n✅ 取得しました。これを .env に貼り付けてください:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tok.refresh_token}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
