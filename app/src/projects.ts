/**
 * Project source catalog for the control room.
 *
 * A "project" is a SOURCE the user can pull INTO a chat's workspace — never a
 * directory a chat binds in place. Isolation model (spec §36: sharing is
 * explicit, never the silent default):
 *
 *   - GitHub repo : the wizard clones it INTO each chat's workspace (per-chat
 *     clone, per-chat branch work). Registration is purely declarative.
 *   - local folder: the wizard COPIES it into each chat's workspace
 *     (node_modules/dist/.git/.paw/.acc excluded). The original is never
 *     touched — two chats on the same folder never mix.
 *
 * The registry therefore records sources (id, name, repo, connectedAt) and
 * creates NO directories and binds NO roots.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";
import type { RepositoryProvider } from "@proagents/contracts";

export interface ConnectedProject {
  readonly id: string;
  readonly name: string;
  readonly source: "local" | "github";
  /** Project root relative to the UI base dir (local sources only). */
  readonly root: string;
  readonly absoluteRoot: string;
  readonly connectedAt: string;
  readonly repo?: string;
  readonly branch?: string;
}

export interface ProjectRegistryOptions {
  readonly baseDir: string;
  /** Absolute path the registry allows projects under (the base dir). */
  readonly getRepository: () => Promise<RepositoryProvider | undefined>;
}

export class ProjectRegistry {
  private readonly projects = new Map<string, ConnectedProject>();

  constructor(private readonly options: ProjectRegistryOptions) {}

  list(): readonly ConnectedProject[] {
    return [...this.projects.values()].sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  }

  get(id: string): ConnectedProject | undefined {
    return this.projects.get(id);
  }

  /** Register a local folder as a copy SOURCE: must exist, must be inside the base dir. */
  async connectLocal(request: { path: string; name?: string }): Promise<ConnectedProject> {
    const absolute = path.resolve(this.options.baseDir, request.path);
    if (!absolute.startsWith(this.options.baseDir)) {
      throw new WorkspaceError({
        code: "PERMISSION_DENIED",
        message: `Local folder must be inside the workspace base directory (${this.options.baseDir}).`,
        recoverable: true,
        suggestions: ["Place the project under the base dir", "Restart the UI with PAW_UI_BASE_DIR set to the parent of your projects"],
      });
    }
    const stat = await fs.stat(absolute).catch(() => undefined);
    if (stat?.isDirectory() !== true) {
      throw new WorkspaceError({
        code: "WORKSPACE_INVALID_STATE",
        message: `Folder ${absolute} does not exist or is not a directory.`,
        recoverable: true,
        suggestions: ["Create the folder first", "Check the path spelling"],
      });
    }
    // A source must not live inside any chat's workspace — chats are private
    // scratch environments; registering one as a reusable source would let a
    // later chat copy another chat's state (mixing exactly what §36 forbids).
    const rel = path.relative(this.options.baseDir, absolute);
    if (rel === "chats" || rel.startsWith(`chats${path.sep}`)) {
      throw new WorkspaceError({
        code: "PERMISSION_DENIED",
        message: "A chat workspace cannot be registered as a project source.",
        recoverable: true,
        suggestions: ["Connect the original project folder instead"],
      });
    }
    const id = slug(request.name ?? path.basename(absolute));
    assertFree(this.projects, id);
    const project: ConnectedProject = {
      id,
      name: request.name ?? path.basename(absolute),
      source: "local",
      root: rel || ".",
      absoluteRoot: absolute,
      connectedAt: new Date().toISOString(),
    };
    this.projects.set(id, project);
    return project;
  }

  /**
   * Register a GitHub repo as a clone SOURCE. NO directory is created here —
   * each chat's wizard run clones the repo INTO that chat's own workspace
   * (a per-chat clone; no shared clone target exists anymore).
   *
   * The token (PAW_GITHUB_TOKEN / GITHUB_TOKEN) is injected into the clone
   * URL by the wizard at launch time and never logged or returned.
   */
  async connectGithub(request: { repo: string; branch?: string; name?: string }): Promise<ConnectedProject> {
    const repo = normalizeRepo(request.repo);
    const name = request.name ?? repo.name;
    const id = slug(name);
    assertFree(this.projects, id);

    const project: ConnectedProject = {
      id,
      name,
      source: "github",
      root: path.join("repos", id), // display-only; no dir is created
      absoluteRoot: path.join(this.options.baseDir, "repos", id), // display-only
      connectedAt: new Date().toISOString(),
      repo: `${repo.owner}/${repo.name}`,
      ...(request.branch !== undefined ? { branch: request.branch } : {}),
    };
    this.projects.set(id, project);
    return project;
  }
}

function normalizeRepo(input: string): { owner: string; name: string; url: string } {
  const trimmed = input.trim();
  const shorthand = /^([\w.-]+)\/([\w.-]+?)(\.git)?$/.exec(trimmed);
  if (shorthand !== null) {
    return { owner: shorthand[1] as string, name: shorthand[2] as string, url: `https://github.com/${shorthand[1]}/${shorthand[2]}.git` };
  }
  const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?$/.exec(trimmed);
  if (url !== null) {
    return { owner: url[1] as string, name: url[2] as string, url: `https://github.com/${url[1]}/${url[2]}.git` };
  }
  throw new WorkspaceError({
    code: "CONFIG_INVALID",
    message: `Not a GitHub repository reference: "${input}" (use owner/repo or a https://github.com/... URL).`,
    recoverable: true,
    suggestions: ["Use the owner/repo shorthand", "Use the full https clone URL"],
  });
}

function slug(input: string): string {
  const s = input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length === 0) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: "Project name produced an empty id.",
      recoverable: true,
      suggestions: ["Provide a `name` for the project"],
    });
  }
  return s;
}

function assertFree(projects: Map<string, ConnectedProject>, id: string): void {
  if (projects.has(id)) {
    throw new WorkspaceError({
      code: "WORKSPACE_ALREADY_MOUNTED",
      message: `A project named "${id}" is already connected.`,
      recoverable: true,
      suggestions: ["Choose a different name", "Disconnect the existing project first"],
    });
  }
}
