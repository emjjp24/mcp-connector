import fs from "node:fs";
import { join } from "node:path";
import { ROOT } from "./sandbox.js";
import { ToolError } from "./tool.js";
import { runGit } from "./tools/git.js";
import { setupHandoff } from "./tools/handoff.js";

/** First-run setup: .gitignore, git repo and the four handoff files inside the workspace. */
export function setupWorkspace(): void {
  const gitignore = join(ROOT, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, ".trash/\n", "utf8");

  if (!fs.existsSync(join(ROOT, ".git"))) {
    try {
      runGit("init");
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      console.warn("Warning: git not found, git tools will not work.");
    }
  }
  setupHandoff();
}
