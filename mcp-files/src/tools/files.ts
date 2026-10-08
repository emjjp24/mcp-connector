/**
 * FILE TOOLS (9)
 * Each defineTool() below becomes one MCP tool. The zod `shape` validates every input,
 * and the descriptions are what the AI reads to learn how to use the tool.
 */
import fs from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { BLOCKED_FOLDERS, MAX_CHARS, ROOT, readText, safePath, saveText, show, splitLines } from "../sandbox.js";
import { defineTool, fail } from "../tool.js";

/** List what is inside a folder (folders first-level or all levels). Hides reserved folders. Stops at `limit`. */
function walk(dir: string, recursive: boolean, limit: number, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (out.length >= limit) break;
    const full = join(dir, entry.name);
    if (BLOCKED_FOLDERS.includes(relative(ROOT, full).split(sep)[0])) continue;
    out.push(full);
    if (recursive && entry.isDirectory()) walk(full, true, limit, out); // symlinked folders are not followed
  }
  return out;
}

const listFiles = defineTool({
  name: "list_files",
  description: "List the files and folders inside a folder.",
  shape: {
    path: z.string().default(".").describe("Folder relative to the workspace (default is the workspace itself)."),
    recursive: z.boolean().default(false).describe("True to also list everything inside sub-folders."),
  },
  readOnly: true,
  run({ path, recursive }) {
    const folder = safePath(path);
    if (!fs.existsSync(folder)) fail(`Not found: '${path}'.`);
    if (!fs.statSync(folder).isDirectory()) fail(`'${path}' is a file, not a folder. Use read_file.`);

    const items = walk(folder, recursive, 201);
    const lines = items.slice(0, 200).map((item) => {
      const info = fs.lstatSync(item);
      return info.isDirectory() ? `[folder] ${show(item)}/` : `[file]   ${show(item)} (${info.size} bytes)`;
    });
    if (items.length > 200) lines.push("... more items not shown. Use a smaller path.");
    return lines.length ? lines.join("\n") : "Folder is empty.";
  },
});

const readFile = defineTool({
  name: "read_file",
  description:
    "Read a text file (a piece at a time). Lines are numbered 'N: text'. " +
    "Do not include the 'N: ' numbers when you use edit_file.",
  shape: {
    path: z.string().describe("The file to read."),
    start_line: z.number().int().min(1).default(1).describe("First line to read (starts at 1)."),
    max_lines: z.number().int().min(1).max(1000).default(200).describe("How many lines to read."),
  },
  readOnly: true,
  run({ path, start_line, max_lines }) {
    const full = safePath(path);
    if (!fs.existsSync(full)) fail(`Not found: '${path}'. Use list_files to check the name.`);
    const lines = splitLines(readText(full));

    const chunk = lines.slice(start_line - 1, start_line - 1 + max_lines);
    let text = chunk.map((line, i) => `${start_line + i}: ${line}`).join("\n");
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + "\n... cut off. Ask for fewer lines.";

    const end = start_line + chunk.length - 1;
    let header = `${show(full)} (lines ${start_line}-${end} of ${lines.length})`;
    if (end < lines.length) header += ` - continue with start_line=${end + 1}`;
    return header + "\n" + text;
  },
});

const writeFile = defineTool({
  name: "write_file",
  description:
    "Create a new file with the given content. Missing folders are created automatically. " +
    "If the file already exists you must set overwrite=true (for small changes use edit_file).",
  shape: {
    path: z.string().describe("The file to create."),
    content: z.string().describe("The full text of the file."),
    overwrite: z.boolean().default(false).describe("Set true to replace a file that already exists."),
  },
  destructive: true,
  run({ path, content, overwrite }) {
    const full = safePath(path, true);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) fail(`'${path}' is a folder.`);
    if (fs.existsSync(full) && !overwrite) {
      fail(`'${path}' already exists. Use edit_file for small changes, or set overwrite=true to replace it.`);
    }
    saveText(full, content);
    return `Saved ${show(full)} (${content.length} characters).`;
  },
});

const editFile = defineTool({
  name: "edit_file",
  description:
    "Change a file by replacing old_text with new_text. old_text must appear exactly ONCE, " +
    "so include a few surrounding words if needed. Read the file first.",
  shape: {
    path: z.string().describe("The file to change."),
    old_text: z.string().describe("The exact text to replace (copy it from read_file, without the 'N: ' numbers)."),
    new_text: z.string().describe("The text to put in its place."),
  },
  destructive: true,
  run({ path, old_text, new_text }) {
    const full = safePath(path, true);
    if (!fs.existsSync(full)) fail(`Not found: '${path}'.`);
    if (old_text === "") fail("old_text cannot be empty.");
    const text = readText(full);

    const count = text.split(old_text).length - 1;
    if (count === 0) fail("old_text was not found. Copy it exactly from read_file (without the 'N: ' numbers).");
    if (count > 1) fail(`old_text appears ${count} times. Add more surrounding text so it is unique.`);

    saveText(full, text.replace(old_text, () => new_text)); // the () => keeps '$' in new_text literal
    return `Edited ${show(full)}.`;
  },
});

const deleteFile = defineTool({
  name: "delete_file",
  description: "Delete a file or folder. You must set confirm=true. It is moved to a .trash folder, so it can be recovered.",
  shape: {
    path: z.string().describe("The file or folder to delete."),
    confirm: z.boolean().default(false).describe("Must be true, otherwise nothing is deleted."),
  },
  destructive: true,
  run({ path, confirm }) {
    const full = safePath(path, true);
    if (!fs.existsSync(full)) fail(`Not found: '${path}'.`);
    if (!confirm) fail(`This deletes '${path}'. Call again with confirm=true if you are sure.`);

    const trash = join(ROOT, ".trash");
    fs.mkdirSync(trash, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    let newName = `${stamp}_${show(full).replaceAll("/", "__")}`;
    if (fs.existsSync(join(trash, newName))) newName += `-${Date.now()}`;
    fs.renameSync(full, join(trash, newName));
    return `Moved '${path}' to .trash/${newName}.`;
  },
});

const renameFile = defineTool({
  name: "rename_file",
  description: "Rename or move a file or folder.",
  shape: {
    old_path: z.string().describe("Current path."),
    new_path: z.string().describe("New path (must not exist yet)."),
  },
  run({ old_path, new_path }) {
    const from = safePath(old_path, true);
    const to = safePath(new_path, true);
    if (!fs.existsSync(from)) fail(`Not found: '${old_path}'.`);
    if (fs.existsSync(to)) fail(`'${new_path}' already exists. Pick another name.`);
    fs.mkdirSync(dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return `Renamed '${old_path}' to '${new_path}'.`;
  },
});

const makeFolder = defineTool({
  name: "make_folder",
  description: "Create a folder (and any missing parent folders).",
  shape: { path: z.string().describe("The folder to create.") },
  run({ path }) {
    const full = safePath(path, true);
    fs.mkdirSync(full, { recursive: true });
    return `Folder ready: ${show(full)}/`;
  },
});

const touchFile = defineTool({
  name: "touch_file",
  description: "Create an empty file, or update its 'last modified' time if it already exists.",
  shape: { path: z.string().describe("The file to touch.") },
  run({ path }) {
    const full = safePath(path, true);
    fs.mkdirSync(dirname(full), { recursive: true });
    if (fs.existsSync(full)) fs.utimesSync(full, new Date(), new Date());
    else fs.writeFileSync(full, "");
    return `Touched ${show(full)}`;
  },
});

const searchText = defineTool({
  name: "search_text",
  description:
    "Find a piece of text inside files (ignores upper/lower case). Returns 'file:line: the line'. " +
    "Use this instead of reading many files one by one.",
  shape: {
    text: z.string().min(1).describe("The text to look for."),
    path: z.string().default(".").describe("Folder or file to search in (default is the whole workspace)."),
    max_results: z.number().int().min(1).max(500).default(50).describe("Stop after this many matches."),
  },
  readOnly: true,
  run({ text, path, max_results }) {
    const base = safePath(path);
    if (!fs.existsSync(base)) fail(`Not found: '${path}'.`);
    const files = fs.statSync(base).isFile()
      ? [base]
      : walk(base, true, Infinity).filter((f) => fs.lstatSync(f).isFile()); // skips symlinks and folders

    const needle = text.toLowerCase();
    const results: string[] = [];
    for (const file of files) {
      if (fs.statSync(file).size > 1_000_000) continue;
      let lines: string[];
      try {
        lines = splitLines(readText(file));
      } catch {
        continue; // skip images and other non-text files
      }
      for (const [i, line] of lines.entries()) {
        if (!line.toLowerCase().includes(needle)) continue;
        results.push(`${show(file)}:${i + 1}: ${line.trim().slice(0, 200)}`);
        if (results.length >= max_results) return results.join("\n") + "\n... stopped early. Use a more specific search.";
      }
    }
    return results.length ? results.join("\n") : "No matches.";
  },
});

export const fileTools = [listFiles, readFile, writeFile, editFile, deleteFile, renameFile, makeFolder, touchFile, searchText];
