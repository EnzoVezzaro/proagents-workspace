/**
 * Editor support for the workspace view (VS Code-like experience): a file
 * tree + read/write through the WORKSPACE's kernel-mediated filesystem.
 *
 * Reads/writes go through Node fs with a hard containment check against the
 * workspace root — the same guarantee the kernel's filesystem provider gives
 * the parent workspace, applied to the named workspace's sandbox root. All
 * writes also flow through the mounted workspace's sandbox policy by
 * construction (read-only workspaces are edited nowhere — the UI refuses
 * before the disk is touched).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";
import type { MountedWorkspace } from "@proagents/kernel";

const IGNORED = new Set([".git", "node_modules", "dist", ".DS_Store", "coverage", ".next"]);

export interface TreeNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "dir";
  readonly size?: number;
}

function withinRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** List one directory of the workspace (non-recursive, ignored dirs filtered). */
export async function listDir(mounted: MountedWorkspace, relDir: string): Promise<readonly TreeNode[]> {
  const dir = path.resolve(mounted.root, relDir === "" ? "." : relDir);
  if (!withinRoot(mounted.root, dir) && dir !== mounted.root) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: "Path escapes the workspace root.",
      recoverable: false,
      suggestions: [],
    });
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(mounted.root, abs);
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: rel, type: "dir" });
    } else if (entry.isFile()) {
      const stat = await fs.stat(abs).catch(() => undefined);
      nodes.push({ name: entry.name, path: rel, type: "file", ...(stat !== undefined ? { size: stat.size } : {}) });
    }
  }
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

/** Read a file inside the workspace (bounded — editor panes, not data dumps). */
export async function readFile(mounted: MountedWorkspace, relPath: string): Promise<{ path: string; content: string; truncated: boolean }> {
  const abs = path.resolve(mounted.root, relPath);
  if (!withinRoot(mounted.root, abs)) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: "Path escapes the workspace root.",
      recoverable: false,
      suggestions: [],
    });
  }
  const MAX = 512 * 1024;
  const stat = await fs.stat(abs).catch(() => undefined);
  if (stat === undefined || !stat.isFile()) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: `Not a file: ${relPath}`,
      recoverable: true,
      suggestions: ["Refresh the file tree"],
    });
  }
  const handle = await fs.open(abs, "r");
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, MAX));
    await handle.read(buffer, 0, buffer.length, 0);
    return { path: relPath, content: buffer.toString("utf8"), truncated: stat.size > MAX };
  } finally {
    await handle.close();
  }
}

/** Write a file inside the workspace. Refused outright for read-only sandboxes. */
export async function writeFile(mounted: MountedWorkspace, relPath: string, content: string): Promise<{ path: string; bytes: number }> {
  if (mounted.sandbox === "read-only") {
    throw new WorkspaceError({
      code: "SANDBOX_POLICY_VIOLATION",
      message: `Workspace "${mounted.workspaceId}" is read-only — editor writes are refused.`,
      recoverable: false,
      suggestions: ["Remount the workspace with a writable sandbox mode"],
    });
  }
  const abs = path.resolve(mounted.root, relPath);
  if (!withinRoot(mounted.root, abs)) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: "Path escapes the workspace root.",
      recoverable: false,
      suggestions: [],
    });
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return { path: relPath, bytes: Buffer.byteLength(content, "utf8") };
}
