import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Workspace scripts run with server/ as cwd; secrets still live at the repo root.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
