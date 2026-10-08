/** Endpoint tests: a real HTTP server, a real MCP request, and every way to get the token wrong. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { setupWorkspace } from "../src/setup.js";

const TOKEN = process.env.MCP_TOKEN!;
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-logs-"));

function start(allowUrlToken: boolean): Promise<{ base: string; stop: () => void }> {
  const server = createApp({ token: TOKEN, allowUrlToken, logDir });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, stop: () => server.close() }),
    ),
  );
}

const MCP_HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const rpc = (method: string, params: unknown = {}, id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const post = (url: string, body: string, extra: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { ...MCP_HEADERS, ...extra }, body });
const bearer = { Authorization: `Bearer ${TOKEN}` };

let both: Awaited<ReturnType<typeof start>>;
let headerOnly: Awaited<ReturnType<typeof start>>;

beforeAll(async () => {
  setupWorkspace();
  both = await start(true);
  headerOnly = await start(false);
});
afterAll(() => {
  both.stop();
  headerOnly.stop();
});

test("no token is 401", async () => {
  const r = await post(`${both.base}/mcp`, rpc("tools/list"));
  expect(r.status).toBe(401);
  expect(r.headers.get("www-authenticate")).toBe("Bearer");
});

test("wrong URL token is 401", async () => {
  expect((await post(`${both.base}/wrong-token/mcp`, rpc("tools/list"))).status).toBe(401);
});

test("wrong or malformed Bearer is 401", async () => {
  for (const value of ["Bearer nope", TOKEN, `Basic ${TOKEN}`, "Bearer "]) {
    expect((await post(`${both.base}/mcp`, rpc("tools/list"), { Authorization: value })).status).toBe(401);
  }
});

test("correct Bearer lists all 17 tools", async () => {
  const r = await post(`${both.base}/mcp`, rpc("tools/list"), bearer);
  expect(r.status).toBe(200);
  const { result } = await r.json();
  expect(result.tools).toHaveLength(17);
  const del = result.tools.find((t: any) => t.name === "delete_file");
  expect(del.annotations.destructiveHint).toBe(true);
  expect(result.tools.find((t: any) => t.name === "read_file").annotations.readOnlyHint).toBe(true);
});

test("correct URL token lists all 17 tools", async () => {
  const r = await post(`${both.base}/${TOKEN}/mcp`, rpc("tools/list"));
  expect(r.status).toBe(200);
  expect((await r.json()).result.tools).toHaveLength(17);
});

test("URL token can be turned off, Bearer still works", async () => {
  expect((await post(`${headerOnly.base}/${TOKEN}/mcp`, rpc("tools/list"))).status).toBe(401);
  expect((await post(`${headerOnly.base}/mcp`, rpc("tools/list"), bearer)).status).toBe(200);
});

test("a real tool call works, and errors come back as isError (no stack trace)", async () => {
  const ok = await (await post(`${both.base}/mcp`, rpc("tools/call", { name: "list_files", arguments: {} }), bearer)).json();
  expect(ok.result.isError).toBeFalsy();

  const bad = await (await post(`${both.base}/mcp`, rpc("tools/call", { name: "read_file", arguments: { path: "../x" } }), bearer)).json();
  expect(bad.result.isError).toBe(true);
  expect(bad.result.content[0].text).toMatch(/outside the workspace/);
  expect(bad.result.content[0].text).not.toMatch(/\bat\s+\S+\.(ts|js)/); // no stack trace
});

test("every call is written to the log", () => {
  const lines = fs.readFileSync(path.join(logDir, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.some((l) => l.tool === "read_file" && l.ok === false)).toBe(true);
  expect(lines.some((l) => l.tool === "list_files" && l.ok === true)).toBe(true);
});

test("other methods and paths are refused", async () => {
  expect((await fetch(`${both.base}/mcp`, { headers: bearer })).status).toBe(405);
  expect((await post(`${both.base}/other`, rpc("tools/list"), bearer)).status).toBe(404);
  expect((await post(`${both.base}/mcp`, "not json", bearer)).status).toBe(400);
});
