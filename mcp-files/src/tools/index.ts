import { fileTools } from "./files.js";
import { gitTools } from "./git.js";
import { handoffTools } from "./handoff.js";

/** The full menu the AI sees (17 tools). To add a tool: write it in one of the files above and it shows up here. */
export const allTools = [...fileTools, ...gitTools, ...handoffTools];
