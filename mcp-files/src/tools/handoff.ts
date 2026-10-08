/**
 * HANDOFF TOOLS (5)
 * These let one AI session leave notes for the next session (the "handoff protocol").
 * Four files live in workspace/handoff/ :
 *   PROJECT_STATE.md  where the project is right now (gets replaced)
 *   PLAN_LOG.md       what the AI plans to do         (only added to)
 *   CHECKPOINTS.md    finished work + what comes next (only added to)
 *   DECISIONS.md      choices made and why            (only added to)
 * The normal file tools are NOT allowed to touch this folder, so the notes stay trustworthy.
 */
import fs from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT, splitLines } from "../sandbox.js";
import { defineTool } from "../tool.js";
import { commitAll } from "./git.js";

const HANDOFF = join(ROOT, "handoff");

const TEMPLATES = {
  "PROJECT_STATE.md": "# PROJECT_STATE\n\n## Goal\n(not set)\n\n## Done\n\n## In progress\n\n## Next\n\n## Blockers\n",
  "PLAN_LOG.md": "# PLAN_LOG\n\n(one line per step: what will be done and why)\n\n",
  "CHECKPOINTS.md": "# CHECKPOINTS\n\n(one section per finished chunk of work)\n",
  "DECISIONS.md": "# DECISIONS\n\n(what was decided and why)\n\n",
};
type HandoffFile = keyof typeof TEMPLATES;

const now = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const oneLine = (text: string) => text.trim().replace(/\s*[\r\n]+\s*/g, " "); // a note can't forge extra log lines

/** The path of a handoff file, created from its template if needed. */
function getFile(name: HandoffFile): string {
  fs.mkdirSync(HANDOFF, { recursive: true });
  const file = join(HANDOFF, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, TEMPLATES[name], "utf8");
  return file;
}

export function setupHandoff(): void {
  for (const name of Object.keys(TEMPLATES) as HandoffFile[]) getFile(name);
}

const read = (name: HandoffFile) => fs.readFileSync(getFile(name), "utf8");
const add = (name: HandoffFile, text: string) => fs.appendFileSync(getFile(name), text, "utf8"); // never erases old notes
const lastLines = (name: HandoffFile, count: number) => splitLines(read(name)).slice(-count).join("\n");

const agent = z.string().regex(/^[\w .-]{1,40}$/, "letters, numbers, space, . _ - only (max 40)")
  .describe("Your name or role, for example 'planner' or 'coder'.");

const startSession = defineTool({
  name: "start_session",
  description:
    "CALL THIS FIRST in every new chat. Returns the project state, recent plan steps, " +
    "the latest checkpoint and recent decisions, so you can continue earlier work.",
  shape: { agent },
  run({ agent }) {
    const checkpoints = read("CHECKPOINTS.md").split("\n## ");
    const latest = checkpoints.length > 1 ? "## " + checkpoints[checkpoints.length - 1] : "(none yet)";
    add("PLAN_LOG.md", `- [${now()}] [${agent}] session started\n`);
    return (
      `=== PROJECT_STATE ===\n${read("PROJECT_STATE.md")}\n` +
      `=== PLAN_LOG (last 15 lines) ===\n${lastLines("PLAN_LOG.md", 15)}\n` +
      `=== LATEST CHECKPOINT ===\n${latest}\n` +
      `=== DECISIONS (last 20 lines) ===\n${lastLines("DECISIONS.md", 20)}`
    );
  },
});

const updateProjectState = defineTool({
  name: "update_project_state",
  description: "Replace PROJECT_STATE.md with a short, current summary (goal, done, in progress, next, blockers).",
  shape: { agent, content: z.string().min(1).describe("The new summary (markdown).") },
  destructive: true,
  run({ agent, content }) {
    fs.writeFileSync(getFile("PROJECT_STATE.md"), `${content.trim()}\n\n_Updated ${now()} by ${agent}_\n`, "utf8");
    return "PROJECT_STATE updated.";
  },
});

const logPlan = defineTool({
  name: "log_plan",
  description: "Write ONE line to PLAN_LOG saying what you will do next and why. Do this BEFORE a multi-step task.",
  shape: { agent, entry: z.string().min(1).describe("One line: what you will do next and why.") },
  run({ agent, entry }) {
    add("PLAN_LOG.md", `- [${now()}] [${agent}] ${oneLine(entry)}\n`);
    return "Plan logged.";
  },
});

const saveCheckpoint = defineTool({
  name: "save_checkpoint",
  description: "Save a checkpoint when you finish a chunk of work, so the next session can continue.",
  shape: {
    agent,
    summary: z.string().min(1).describe("What is finished."),
    next_steps: z.string().default("").describe("What to do next."),
    commit: z.boolean().default(true).describe("Also save a git commit."),
  },
  run({ agent, summary, next_steps, commit }) {
    add("CHECKPOINTS.md", `\n## ${now()} - ${agent}\n${summary.trim()}\n\n**Next:** ${next_steps.trim() || "(none)"}\n`);
    let message = "Checkpoint saved.";
    if (commit) {
      const firstLine = splitLines(summary.trim())[0]?.slice(0, 80) || "checkpoint";
      message += " " + commitAll("checkpoint: " + firstLine, agent);
    }
    return message;
  },
});

const recordDecision = defineTool({
  name: "record_decision",
  description: "Write down an important choice and WHY you made it (for example the tech stack).",
  shape: { agent, decision: z.string().min(1).describe("What was decided."), reason: z.string().min(1).describe("Why.") },
  run({ agent, decision, reason }) {
    add("DECISIONS.md", `- [${now()}] [${agent}] **${oneLine(decision)}** - ${oneLine(reason)}\n`);
    return "Decision recorded.";
  },
});

export const handoffTools = [startSession, updateProjectState, logPlan, saveCheckpoint, recordDecision];
