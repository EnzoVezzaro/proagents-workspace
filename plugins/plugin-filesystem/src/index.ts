/**
 * Filesystem capability plugin.
 *
 * Sandboxed to the read/write path grants in workspace.yaml permissions
 * (spec section 34). Every write emits `filesystem/before-write` and AWAITS it
 * — protection subscribers veto BEFORE bytes hit the disk (spec 101–102).
 */
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FilesystemProvider, ProviderHealth } from "@proagents/workspace";

const filesystemDefinition = defineService<FilesystemProvider>({
  id: "filesystem",
  contractVersion: "1.0.0",
  requiredPermissions: ["filesystem:read:/workspace/repo", "filesystem:write:/workspace/repo"],
});

function resolveWithin(root: string, target: string, mode: "read" | "write"): string {
  const resolved = path.resolve(root, target);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: `Path ${target} escapes the sandboxed root ${root}.`,
      provider: "filesystem",
      recoverable: false,
      suggestions: ["Use paths inside the workspace filesystem", "Grant additional paths in permissions"],
    });
  }
  void mode;
  return resolved;
}

export const filesystemPlugin = definePlugin({
  manifest: {
    id: "filesystem",
    name: "Filesystem",
    version: "0.1.0",
    description: "Sandboxed filesystem operations inside the workspace",
    capabilities: ["filesystem"],
    dependencies: [],
    permissions: ["filesystem:read:/workspace/repo", "filesystem:write:/workspace/repo"],
    compatibility: { workspaceApi: "^1.0.0", filesystemContract: "^1.0.0" },
  },
  activate(ctx) {
    const root = path.resolve(String(ctx.pluginOptions()["root"] ?? "/workspace/repo"));
    const logger = ctx.logger;

    // Refine the effective permission request to the ACTUAL configured root
    // (config grants are intersected again, so this cannot exceed workspace.yaml).
    ctx.permissions.refinePlugin("filesystem", [
      `filesystem:read:${root}`,
      `filesystem:write:${root}`,
    ]);

    const provider: FilesystemProvider = {
      name: "filesystem",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        try {
          await fs.access(root);
          return { status: "healthy", message: `root ${root} accessible` };
        } catch {
          return { status: "degraded", message: `root ${root} does not exist yet` };
        }
      },
      async read(request) {
        ctx.permissions.require({ pluginId: "filesystem", category: `filesystem:read:${root}`, target: request.path });
        const resolved = resolveWithin(root, request.path, "read");
        return fs.readFile(resolved, request.encoding ?? "utf8");
      },
      async write(request) {
        ctx.permissions.require({ pluginId: "filesystem", category: `filesystem:write:${root}`, target: request.path });
        const resolved = resolveWithin(root, request.path, "write");
        const content = Buffer.from(request.content, "utf8");
        // Protection intervenes BEFORE execution (spec sections 101–102).
        await ctx.events.emit("filesystem/before-write", { path: resolved, size: content.byteLength });
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content);
        await ctx.events.emit("filesystem/after-write", { path: resolved, size: content.byteLength });
        logger.debug("filesystem/write", { durationMs: 0, result: "ok" });
        return { bytes: content.byteLength };
      },
      async list(request) {
        ctx.permissions.require({ pluginId: "filesystem", category: `filesystem:read:${root}`, target: request.path });
        const resolved = resolveWithin(root, request.path, "read");
        if (request.recursive === true) {
          const out: string[] = [];
          const walk = async (dir: string): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) await walk(full);
              else out.push(full);
            }
          };
          await walk(resolved);
          return out;
        }
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        return entries.map((e) => path.join(resolved, e.name));
      },
      async remove(request) {
        ctx.permissions.require({ pluginId: "filesystem", category: `filesystem:write:${root}`, target: request.path });
        const resolved = resolveWithin(root, request.path, "write");
        await fs.rm(resolved, { recursive: request.recursive ?? false });
      },
    };

    ctx.services.register(filesystemDefinition, provider, "filesystem");
  },
});
