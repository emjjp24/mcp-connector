/**
 * SANDBOX
 * The ONLY folder the AI may touch is ROOT. Every tool calls safePath() before touching a file.
 */
import "./env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "./tool.js";

const rootSetting = (process.env.WORKSPACE_ROOT || "./workspace").replace(/^~(?=$|[\\/])/, os.homedir());
fs.mkdirSync(path.resolve(rootSetting), { recursive: true });

export const ROOT = fs.realpathSync(path.resolve(rootSetting));
export const BLOCKED_FOLDERS = [".git", ".trash"]; // the AI can never open these
export const MAX_CHARS = 20000; // keep answers small so the AI doesn't get flooded

/** Like realpath, but works for files that don't exist yet: follow symlinks for the part that exists. */
function realResolve(p: string): string {
  const missing: string[] = [];
  let current = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

/** Turn a path like 'notes/a.txt' into a real path, but only if it stays inside ROOT. */
export function safePath(input: string, forWriting = false): string {
  if (!input) input = ".";

  // 1. No absolute paths like /etc/passwd, C:\Windows or \\server\share
  if (path.isAbsolute(input) || /^[\\/]/.test(input) || /^[a-zA-Z]:/.test(input)) {
    fail("Use a path relative to the workspace, not an absolute path.");
  }

  // 2. Clean up '..' and follow symlinks, so tricks like '../../x' or a link to /etc get exposed
  const full = realResolve(path.resolve(ROOT, input));

  // 3. After cleaning, the path must still be inside ROOT
  const rel = path.relative(ROOT, full);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    fail(`'${input}' is outside the workspace. Stay inside the workspace folder.`);
  }
  const firstFolder = rel.split(path.sep)[0]; // "" when full is ROOT itself

  // 4. Reserved folders
  if (BLOCKED_FOLDERS.includes(firstFolder)) {
    fail(`The folder '${firstFolder}' is reserved and cannot be used.`);
  }

  // 5. Extra rules for anything that changes files
  if (forWriting) {
    if (full === ROOT) fail("You cannot change the workspace root itself.");
    if (firstFolder === "handoff") {
      fail("The handoff folder is managed by the session tools (log_plan, save_checkpoint, ...). Use those instead.");
    }
  }
  return full;
}

/** Path as text, relative to ROOT (what we show to the AI). */
export function show(full: string): string {
  return full === ROOT ? "." : path.relative(ROOT, full).split(path.sep).join("/");
}

/** Read a text file. Gives a clear error for folders and binary files. */
export function readText(full: string): string {
  if (fs.statSync(full).isDirectory()) fail(`'${show(full)}' is a folder. Use list_files.`);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(full));
  } catch {
    fail(`'${show(full)}' is not a text file.`);
  }
}

export function saveText(full: string, text: string): void {
  fs.mkdirSync(path.dirname(full), { recursive: true }); // create missing folders
  fs.writeFileSync(full, text, "utf8");
}

/** Split text into lines, without a fake empty line at the end. */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
