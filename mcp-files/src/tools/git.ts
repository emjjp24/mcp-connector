/**
 * GIT TOOLS (3)
 * Small wrappers around the git command. git must be installed on your PC.
 * Arguments are passed as a list (never through a shell), so they can't be used for command injection.
 */
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { ROOT } from "../sandbox.js";
import { ToolError, defineTool, fail } from "../tool.js";

/** Run one git command inside the workspace and return its text output. */
export function runGit(...args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    if (e.code === "ENOENT") fail("git is not installed on this computer.");
    const command = args.find((a) => !a.startsWith("-") && !a.includes("=")) ?? "command";
    fail(`git ${command} failed: ${String(e.stderr || e.stdout || e.message).trim().slice(0, 300)}`);
  }
}

/** Save every change as one git commit. (Also used by save_checkpoint.) */
export function commitAll(message: string, author: string): string {
  runGit("add", "-A");
  if (runGit("status", "--porcelain").trim() === "") return "Nothing to commit.";
  runGit("-c", `user.name=${author.slice(0, 40)}`, "-c", "user.email=agent@mcp.local", "commit", "-m", message);
  return "Committed: " + runGit("log", "-1", "--pretty=format:%h %s").trim();
}

const gitStatus = defineTool({
  name: "git_status",
  description: "Show which files were changed since the last commit.",
  shape: {},
  readOnly: true,
  run: () => runGit("status", "--short", "--branch").trim() || "Nothing changed.",
});

const gitLog = defineTool({
  name: "git_log",
  description: "Show the most recent commits (who, when, message).",
  shape: { count: z.number().int().min(1).max(100).default(10).describe("How many commits to show.") },
  readOnly: true,
  run({ count }) {
    try {
      return runGit("log", `-n${count}`, "--pretty=format:%h %an %ad %s", "--date=short").trim() || "No commits yet.";
    } catch (e) {
      if (e instanceof ToolError && e.message.includes("not installed")) throw e;
      return "No commits yet.";
    }
  },
});

const gitCommit = defineTool({
  name: "git_commit",
  description: "Save all current changes as a git commit.",
  shape: {
    message: z.string().min(3).describe("A short commit message."),
    author: z.string().regex(/^[\w .-]{1,40}$/).default("agent")
      .describe("Your agent name (for example 'planner'), so the history shows who did what."),
  },
  run: ({ message, author }) => commitAll(message.trim(), author),
});

export const gitTools = [gitStatus, gitLog, gitCommit];
