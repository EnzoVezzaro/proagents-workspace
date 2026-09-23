/**
 * Project connection for the control room.
 *
 * Two documented ways to attach a project (spec section 12 workspace model):
 *  - local folder: validated + registered as an isolated workspace root
 *  - GitHub repo : cloned through the kernel's guarded git plugin (Repo
 *    Shield guards + approval policy apply). A token, if needed, is read
 *    from PAW_GITHUB_TOKEN / GITHUB_TOKEN env and used ONLY inside the
 *    clone URL passed to git — never logged, never returned to the UI.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";
import type { RepositoryProvider } from "@proagents/contracts";

export interface ConnectedProject {
  readonly id: string;
  readonly name: string;
  readonly source: "local" | "github";
  /** Root relative to the UI base dir (stable, portable in API responses). */
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

  /** Connect a local folder: must exist, must be inside the base dir. */
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
    const id = slug(request.name ?? path.basename(absolute));
    assertFree(this.projects, id);
    const project: ConnectedProject = {
      id,
      name: request.name ?? path.basename(absolute),
      source: "local",
      root: path.relative(this.options.baseDir, absolute) || ".",
      absoluteRoot: absolute,
      connectedAt: new Date().toISOString(),
    };
    this.projects.set(id, project);
    return project;
  }

  /**
   * Connect a GitHub repo: REGISTERED now, CLONED at launch — the clone runs
   * as a real `git clone` in the workspace terminal (visible to the user,
   * DSH-style), not a hidden API call. The directory is created empty so the
   * workspace can bind it; the clone fills it at launch.
   *
   * The token (PAW_GITHUB_TOKEN / GITHUB_TOKEN) is injected into the clone
   * URL by the wizard at launch time and never logged or returned.
   */
  async connectGithub(request: { repo: string; branch?: string; name?: string }): Promise<ConnectedProject> {
    const repo = normalizeRepo(request.repo);
    const name = request.name ?? repo.name;
    const id = slug(name);
    assertFree(this.projects, id);

    const targetRoot = path.join(this.options.baseDir, "repos", id);
    await fs.mkdir(targetRoot, { recursive: true });

    const project: ConnectedProject = {
      id,
      name,
      source: "github",
      root: path.relative(this.options.baseDir, targetRoot),
      absoluteRoot: targetRoot,
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
