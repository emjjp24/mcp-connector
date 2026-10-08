/**
 * EXPORT EVIDENCE - copies the proof of your demo into evidence/ so you can commit it.
 *   npm run export-evidence
 * It copies the four handoff files, the call log, the workspace's git history, and a snapshot of the
 * files the agents made (evidence/workspace/).
 *
 * Why a copy and not the workspace itself? The workspace is its own git repo. Inside your project repo,
 * git would store only a pointer to it (an "embedded repository") and your grader would see no files.
 */
import "./env.js";
import fs from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./sandbox.js";
import { runGit } from "./tools/git.js";

const logsDir = fileURLToPath(new URL("../logs", import.meta.url));
const outDir = fileURLToPath(new URL("../evidence", import.meta.url));
fs.mkdirSync(outDir, { recursive: true });

function copy(from: string, name: string): void {
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, join(outDir, name));
    console.log(`copied  ${name}`);
  } else {
    console.warn(`skipped ${name} (not found: ${from})`);
  }
}

for (const name of ["PROJECT_STATE.md", "PLAN_LOG.md", "CHECKPOINTS.md", "DECISIONS.md"]) {
  copy(join(ROOT, "handoff", name), name);
}
copy(join(logsDir, "calls.jsonl"), "calls.jsonl");

try {
  fs.writeFileSync(join(outDir, "git-log.txt"), runGit("log", "--pretty=format:%h %an %ad %s", "--date=iso") + "\n");
  console.log("wrote   git-log.txt");
} catch (e) {
  console.warn("skipped git-log.txt:", e instanceof Error ? e.message : e);
}

// Snapshot of what the agents built: every file except .git, .trash, handoff (copied above) and symlinks.
const snapshot = join(outDir, "workspace");
fs.rmSync(snapshot, { recursive: true, force: true }); // start clean so old files don't linger
fs.cpSync(ROOT, snapshot, {
  recursive: true,
  filter: (src) => {
    const top = relative(ROOT, src).split(sep)[0];
    if ([".git", ".trash", "handoff"].includes(top)) return false;
    return !fs.lstatSync(src).isSymbolicLink();
  },
});
const copied = (fs.readdirSync(snapshot, { recursive: true }) as string[]).length;
console.log(`copied  workspace/ (${copied} items)`);

console.log(`\nEvidence is in ${outDir}\nReview it before you commit: it contains whatever the agents wrote.`);
