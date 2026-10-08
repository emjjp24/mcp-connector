import { z } from "zod";

/** An error whose message is safe to show the AI. Any other error is hidden from it. */
export class ToolError extends Error {}

/** Stop the tool and tell the AI what went wrong. */
export function fail(message: string): never {
  throw new ToolError(message);
}

/** What server.ts needs to know about a tool. */
export type ToolDef = {
  name: string;
  description: string;
  shape: z.ZodRawShape; // zod schema of the inputs (this is the strict input validation)
  readOnly: boolean; // hint for clients: this tool never changes anything
  destructive: boolean; // hint for clients: this tool can overwrite or remove data
  run: (args: any) => string;
};

/** Define a tool. `args` in `run` is fully typed from the zod `shape`. */
export function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  shape: S;
  readOnly?: boolean;
  destructive?: boolean;
  run: (args: z.infer<z.ZodObject<S>>) => string;
}): ToolDef {
  return { readOnly: false, destructive: false, ...def };
}
