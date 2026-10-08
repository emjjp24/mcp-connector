/** Safety tests. Run from the project folder:  npm test */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { ROOT } from "../src/sandbox.js";
import { setupWorkspace } from "../src/setup.js";
import { allTools } from "../src/tools/index.js";
import { call } from "./helpers.js";

beforeAll(() => setupWorkspace());

test("there are 17 tools, each with a description", () => {
  expect(allTools).toHaveLength(17);
  for (const tool of allTools) expect(tool.description.length).toBeGreaterThan(10);
});

test("dotdot is blocked", () => {
  for (const bad of ["../x", "a/../../x", "..", "a/../../../etc/passwd"]) {
    expect(() => call("read_file", { path: bad })).toThrow(/outside/);
  }
});

test("absolute paths are blocked", () => {
  for (const bad of ["/etc/passwd", "C:\\Windows\\win.ini", "\\\\server\\share"]) {
    expect(() => call("read_file", { path: bad })).toThrow(/absolute/);
  }
});

test("symlink escape is blocked", (ctx) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "top secret");
  try {
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(ROOT, "link.txt"));
    fs.symlinkSync(outside, path.join(ROOT, "linkdir"));
  } catch {
    return ctx.skip(); // symlinks not allowed on this system
  }
  expect(() => call("read_file", { path: "link.txt" })).toThrow(/outside/);
  expect(() => call("read_file", { path: "linkdir/secret.txt" })).toThrow(/outside/);
  expect(() => call("write_file", { path: "linkdir/new.txt", content: "x" })).toThrow(/outside/); // new file through a link
});

test("reserved folders are blocked", () => {
  expect(() => call("list_files", { path: ".git" })).toThrow(/reserved/);
});

test("handoff folder is protected", () => {
  expect(() => call("write_file", { path: "handoff/PLAN_LOG.md", content: "wiped", overwrite: true })).toThrow(/handoff/);
  expect(() => call("delete_file", { path: "handoff/DECISIONS.md", confirm: true })).toThrow(/handoff/);
});

test("write does not overwrite by accident", () => {
  call("write_file", { path: "a.txt", content: "hello\n" });
  expect(() => call("write_file", { path: "a.txt", content: "other" })).toThrow(/already exists/);
  call("write_file", { path: "a.txt", content: "new\n", overwrite: true });
  expect(call("read_file", { path: "a.txt" })).toContain("new");
});

test("edit needs exactly one match", () => {
  call("write_file", { path: "b.txt", content: "x x\ny\n" });
  expect(() => call("edit_file", { path: "b.txt", old_text: "x", new_text: "z" })).toThrow(/2 times/);
  expect(() => call("edit_file", { path: "b.txt", old_text: "nope", new_text: "z" })).toThrow(/not found/);
  call("edit_file", { path: "b.txt", old_text: "y", new_text: "$& z" }); // '$' is kept literally
  expect(call("read_file", { path: "b.txt" })).toContain("$& z");
});

test("delete needs confirm and goes to trash", () => {
  call("write_file", { path: "c.txt", content: "bye" });
  expect(() => call("delete_file", { path: "c.txt" })).toThrow(/confirm=true/);
  call("delete_file", { path: "c.txt", confirm: true });
  expect(fs.existsSync(path.join(ROOT, "c.txt"))).toBe(false);
  expect(fs.readdirSync(path.join(ROOT, ".trash")).length).toBeGreaterThan(0);
});

test("rename, touch, make_folder", () => {
  call("write_file", { path: "d.txt", content: "1" });
  call("rename_file", { old_path: "d.txt", new_path: "sub/e.txt" });
  expect(fs.existsSync(path.join(ROOT, "sub", "e.txt"))).toBe(true);
  call("touch_file", { path: "t.txt" });
  call("make_folder", { path: "m/n" });
  expect(() => call("rename_file", { old_path: "sub/e.txt", new_path: "../out.txt" })).toThrow(/outside/);
});

test("search finds text and list_files lists it", () => {
  call("write_file", { path: "code.py", content: "def Hello():\n    return 1\n" });
  expect(call("search_text", { text: "hello" })).toContain("code.py:1");
  expect(call("list_files", { recursive: true })).toContain("[file]   code.py");
});

test("bad input is rejected by the zod schema", () => {
  expect(() => call("read_file", { path: "a.txt", start_line: 0 })).toThrow();
  expect(() => call("read_file", {})).toThrow(); // path is required
  expect(() => call("git_log", { count: 1000 })).toThrow();
  expect(() => call("log_plan", { agent: "bad\nname", entry: "x" })).toThrow();
});

describe("handoff and git", () => {
  test("handoff works between two sessions", () => {
    expect(call("start_session", { agent: "planner" })).toContain("PROJECT_STATE");
    call("log_plan", { agent: "planner", entry: "step one\nFAKE LINE" });
    call("record_decision", { agent: "planner", decision: "Use TypeScript", reason: "reference stack" });
    call("save_checkpoint", { agent: "planner", summary: "Did things", next_steps: "Do more", commit: false });
    const second = call("start_session", { agent: "coder" });
    expect(second).toContain("Did things");
    expect(second).toContain("step one FAKE LINE"); // a newline can't forge a second log line
  });

  test("checkpoint makes a git commit and git tools see it", () => {
    call("write_file", { path: "g.txt", content: "git test" });
    expect(call("save_checkpoint", { agent: "planner", summary: "Committed work", next_steps: "next" })).toContain("Committed");
    expect(call("git_log")).toContain("planner");
    expect(call("git_status")).toBeTruthy();
    expect(call("git_commit", { message: "nothing new" })).toContain("Nothing to commit");
  });
});
