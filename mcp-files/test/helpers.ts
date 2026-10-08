import { z } from "zod";
import { allTools } from "../src/tools/index.js";

/** Call a tool the way the server does: validate the input with its zod schema, then run it. */
export function call(name: string, args: Record<string, unknown> = {}): string {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool.run(z.object(tool.shape).parse(args));
}
