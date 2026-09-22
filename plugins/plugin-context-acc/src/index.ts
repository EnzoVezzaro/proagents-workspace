/**
 * ACC context capability plugin.
 *
 * Indexes `.acc/` context packs (AGENTS.md, config, standards, workflows,
 * memory) and answers queries by ranked path/summary matches. ACC is the
 * context provider of record for this repository — the plugin reports
 * degraded health when the `.acc/` root does not exist.
 */
import { definePlugin, defineService } from "@proagents/workspace";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContextPack, ContextProvider, ProviderHealth } from "@proagents/workspace";

const accContextDefinition = defineService<ContextProvider>({
  id: "context",
  contractVersion: "1.0.0",
  requiredPermissions: ["filesystem:read:/workspace/repo"],
});

const ACC_DOC_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml"]);

interface IndexedEntry {
  id: string;
  path: string;
  summary: string;
}

export const accContextPlugin = definePlugin({
  manifest: {
    id: "context-acc",
    provider: "acc",
    name: "ACC Context",
    version: "0.1.0",
    description: "Indexes .acc/ context packs and serves ranked context queries",
    capabilities: ["context"],
    dependencies: [],
    permissions: ["filesystem:read:/workspace/repo"],
    compatibility: { workspaceApi: "^1.0.0", contextContract: "^1.0.0" },
  },
  activate(ctx) {
    const root = path.resolve(String(ctx.pluginOptions()["root"] ?? "/workspace/repo"));
    const accRoot = path.join(root, ".acc");
    let entries: IndexedEntry[] = [];

    const walk = async (dir: string): Promise<string[]> => {
      const out: string[] = [];
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (ACC_DOC_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
      }
      return out;
    };

    const summarize = (content: string): string => {
      const lines = content.split("\n");
      const headings = lines
        .filter((line) => /^#{1,3}\s/.test(line))
        .slice(0, 5)
        .map((line) => line.replace(/^#{1,3}\s+/, "").trim());
      if (headings.length > 0) return headings.join(" · ");
      const prose = lines.map((l) => l.trim()).filter((l) => l.length > 0)[0] ?? "";
      return prose.slice(0, 160);
    };

    const rank = (request: { text: string; limit?: number }): ContextPack => {
      const terms = request.text.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const limit = request.limit ?? 5;
      const scored = entries
        .map((entry) => {
          const haystack = `${path.basename(entry.path)} ${entry.summary}`.toLowerCase();
          const score = terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0);
          return { entry, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return {
        provider: "context-acc",
        entries: scored.map((s) => ({ id: s.entry.id, path: s.entry.path, summary: s.entry.summary })),
      };
    };

    const provider: ContextProvider = {
      name: "context-acc",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        try {
          const stat = await fs.stat(accRoot);
          return stat.isDirectory()
            ? { status: "healthy", message: `context root ${accRoot}` }
            : { status: "degraded", message: `${accRoot} is not a directory` };
        } catch {
          return { status: "degraded", message: `.acc/ not found at ${root} — context pack unavailable` };
        }
      },

      async index(paths: readonly string[] = []): Promise<void> {
        await ctx.events.emit("context/indexing", { provider: "context-acc" });
        const targets = paths.length > 0 ? paths : [accRoot];
        entries = [];
        for (const target of targets) {
          const resolved = path.resolve(root, target);
          let files: string[] = [];
          try {
            const stat = await fs.stat(resolved);
            files = stat.isDirectory() ? await walk(resolved) : [resolved];
          } catch {
            continue; // missing target: skip; health reports the gap
          }
          for (const file of files) {
            try {
              const content = await fs.readFile(file, "utf8");
              entries.push({ id: path.relative(root, file), path: file, summary: summarize(content) });
            } catch {
              // unreadable file: skip
            }
          }
        }
        await ctx.events.emit("context/indexed", { provider: "context-acc" });
      },

      async query(request: { text: string; limit?: number }): Promise<ContextPack> {
        if (entries.length === 0) await provider.index([]);
        return rank(request);
      },

      async inspect(): Promise<ContextPack> {
        if (entries.length === 0) await provider.index([]);
        return { provider: "context-acc", entries: entries.slice(0, 50) };
      },
    };

    ctx.services.register(accContextDefinition, provider, "context-acc");
  },
});
