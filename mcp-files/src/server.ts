/**
 * MAIN FILE - starts the MCP server.   Run it with:   npm run dev    (or: npm run build && npm start)
 *
 * How it fits together:
 *   tools/files.ts    -> file tools (list, read, write, edit, delete, rename, search ...)
 *   tools/git.ts      -> git tools
 *   tools/handoff.ts  -> notes for the next AI session
 *   sandbox.ts        -> safePath(): the only door to the disk
 *   app.ts            -> token check + MCP server + logging
 *   server.ts (this)  -> reads settings and starts listening
 */
import "./env.js";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { ROOT } from "./sandbox.js";
import { setupWorkspace } from "./setup.js";

const TOKEN = process.env.MCP_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 8000);
const ALLOW_URL_TOKEN = (process.env.ALLOW_URL_TOKEN ?? "true").toLowerCase() !== "false";
const LOG_DIR = fileURLToPath(new URL("../logs", import.meta.url)); // <project>/logs (works from src/ and dist/)

if (TOKEN.length < 16) {
  console.error(
    "Set MCP_TOKEN (at least 16 characters) in your .env file.\n" +
      'Make one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
  );
  process.exit(1);
}

setupWorkspace();

createApp({ token: TOKEN, allowUrlToken: ALLOW_URL_TOKEN, logDir: LOG_DIR }).listen(PORT, "127.0.0.1", () => {
  console.log(`Workspace folder:  ${ROOT}`);
  console.log(`Bearer address:    http://127.0.0.1:${PORT}/mcp   (header  Authorization: Bearer <MCP_TOKEN>)`);
  console.log(ALLOW_URL_TOKEN ? `URL-token address: http://127.0.0.1:${PORT}/<MCP_TOKEN>/mcp` : "URL-token address: disabled (ALLOW_URL_TOKEN=false)");
});
