/**
 * Server-side folder browsing for the "select folder" flow.
 *
 * Browsers cannot show a native OS folder picker — the only honest way to
 * give the desktop-app feel is a server-side browser over the machine's real
 * filesystem, rooted at the UI base dir (containment-checked, IGNORED dirs
 * filtered, symlink-proof via realpath containment).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";
import { BASE_DIR } from "./context.js";

const IGNORED = new Set([".git", "node_modules", "dist", ".DS_Store", "coverage", ".next"]);

export interface BrowsableEntry {
  readonly name: string;
  readonly path: string; // base-dir-relative
  readonly type: "dir" | "file";
}

export interface BrowsedDir {
  /** Base-dir-relative path of the directory being viewed. */
  readonly path: string;
  readonly absolutePath: string;
  readonly entries: readonly BrowsableEntry[];
  readonly parent: string | null;
}

/** True when `candidate` is the base dir itself or inside it (symlink-proof).
 *  Both sides are realpath'd: on macOS /tmp → /private/tmp would otherwise
 *  make every contained path look like an escape. */
function withinBase(candidate: string, realBase: string): boolean {
  return candidate === realBase || candidate.startsWith(realBase + path.sep);
}

/**
 * Resolve a base-dir-relative path to an absolute, contained, real path.
 * Symlinks that escape the base dir resolve to a target outside it → denied.
 */
export function resolveContained(relPath: string): string {
  const abs = path.resolve(BASE_DIR, relPath === "" || relPath === "." ? "." : relPath);
  return abs;
}

export async function browseDir(relPath: string): Promise<BrowsedDir> {
  const abs = resolveContained(relPath);
  const realBase = await fs.realpath(BASE_DIR);
  const real = await fs.realpath(abs).catch(() => undefined);
  if (real === undefined || !withinBase(real, realBase)) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: "Path escapes the workspace base directory.",
      recoverable: false,
      suggestions: [],
    });
  }
  const stat = await fs.stat(real).catch(() => undefined);
  if (stat?.isDirectory() !== true) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: `Not a directory: ${relPath || "."}`,
      recoverable: true,
      suggestions: ["Browse the parent folder"],
    });
  }
  const dirents = await fs.readdir(real, { withFileTypes: true });
  const entries: BrowsableEntry[] = [];
  for (const entry of dirents) {
    if (IGNORED.has(entry.name)) continue;
    const isDir = entry.isDirectory();
    if (!isDir && !entry.isFile()) continue;
    entries.push({
      name: entry.name,
      path: path.relative(BASE_DIR, path.join(real, entry.name)),
      type: isDir ? "dir" : "file",
    });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  const rel = path.relative(realBase, real);
  return {
    path: rel,
    absolutePath: real,
    entries,
    parent: rel === "" ? null : path.dirname(rel) === rel ? null : path.dirname(rel),
  };
}

/** Create a directory under the base dir (recursive; parents must stay inside). */
export async function makeDir(relPath: string): Promise<{ path: string; absolutePath: string }> {
  const abs = resolveContained(relPath);
  await fs.mkdir(abs, { recursive: true });
  const realBase = await fs.realpath(BASE_DIR);
  const real = await fs.realpath(abs);
  if (!withinBase(real, realBase)) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: "Resolved path escapes the workspace base directory.",
      recoverable: false,
      suggestions: [],
    });
  }
  return { path: path.relative(realBase, real), absolutePath: real };
}
