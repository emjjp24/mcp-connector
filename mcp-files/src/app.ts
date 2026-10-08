/**
 * THE HTTP APP: checks the secret token, then hands the request to the MCP server.
 * Every request gets its own MCP server (stateless), so a restart never breaks a chat.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ToolError, type ToolDef } from "./tool.js";
import { allTools } from "./tools/index.js";

export type AppOptions = {
  token: string; // MCP_TOKEN
  allowUrlToken: boolean; // accept /<token>/mcp as well as the Authorization header
  logDir: string; // where calls.jsonl is written
};

const INSTRUCTIONS =
  "Start with start_session. Use log_plan before multi-step work. Read a file before changing it. " +
  "Prefer edit_file over write_file for small changes. Use search_text instead of reading many files. " +
  "Finish with save_checkpoint.";

// ---------------------------------------------------------------------------
// TOOLS: build an MCP server with all tools. Each call is logged and errors become isError results.
// ---------------------------------------------------------------------------
function buildMcpServer(logDir: string): McpServer {
  const logFile = join(logDir, "calls.jsonl");
  fs.mkdirSync(logDir, { recursive: true });

  function runTool(tool: ToolDef, args: Record<string, unknown>) {
    let logError: string | null = null;
    try {
      return { content: [{ type: "text" as const, text: tool.run(args) }] };
    } catch (e) {
      // ToolError messages are written for the AI. Anything else could leak paths or stack traces, so hide it.
      logError = e instanceof Error ? e.message : String(e);
      const text = e instanceof ToolError ? e.message : "Unexpected server error.";
      return { isError: true, content: [{ type: "text" as const, text }] };
    } finally {
      const shortArgs = Object.fromEntries(
        Object.entries(args).map(([k, v]) => [k, typeof v === "string" && v.length > 100 ? v.slice(0, 100) + "..." : v]),
      );
      const record = { time: new Date().toISOString(), tool: tool.name, args: shortArgs, ok: logError === null, error: logError };
      fs.appendFileSync(logFile, JSON.stringify(record) + "\n", "utf8");
    }
  }

  const server = new McpServer({ name: "workspace-files", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.shape,
        annotations: { readOnlyHint: tool.readOnly, destructiveHint: tool.destructive },
      },
      async (args: Record<string, unknown>) => runTool(tool, args),
    );
  }
  return server;
}

// ---------------------------------------------------------------------------
// SECRET TOKEN: a request must carry MCP_TOKEN in ONE of two ways, or it is refused (401):
//   1. Header:   Authorization: Bearer <MCP_TOKEN>     (preferred - stays out of URLs and logs)
//   2. URL path: /<MCP_TOKEN>/mcp                       (for clients that can't send headers)
// ---------------------------------------------------------------------------
const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest();
/** Constant-time comparison (hashing first means the lengths always match). */
const sameSecret = (a: string, b: string) => crypto.timingSafeEqual(sha256(a), sha256(b));

class BadRequest extends Error {}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new BadRequest("Request too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequest("Invalid JSON.");
  }
}

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

export function createApp(options: AppOptions): http.Server {
  const bearerOk = (req: http.IncomingMessage) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
    return match !== null && sameSecret(match[1].trim(), options.token);
  };

  return http.createServer(async (req, res) => {
    try {
      let path = new URL(req.url ?? "/", "http://localhost").pathname;

      if (!bearerOk(req)) {
        // no valid header, so fall back to the secret in the URL path (if that is allowed)
        const match = /^\/([^/]+)(\/.*)$/.exec(path); // "/SECRET/mcp" -> ["SECRET", "/mcp"]
        if (!(options.allowUrlToken && match && sameSecret(match[1], options.token))) {
          return send(res, 401, { error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });
        }
        path = match[2]; // remove the secret part so the MCP server sees just "/mcp"
      }

      if (path !== "/mcp") return send(res, 404, { error: "not found" });
      if (req.method !== "POST") {
        return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, { Allow: "POST" });
      }

      const body = await readJson(req);
      const server = buildMcpServer(options.logDir);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (e instanceof BadRequest) return send(res, 400, { error: e.message });
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: "internal error" });
    }
  });
}
