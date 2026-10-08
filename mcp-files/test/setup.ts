// Runs before every test file: use a temporary workspace so tests never touch your real files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.WORKSPACE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-workspace-"));
process.env.MCP_TOKEN = "x".repeat(32);
