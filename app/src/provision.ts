/**
 * Launch provisioning pipeline — executed as REAL commands in the workspace's
 * REAL terminal (no simulated exec). The wizard composes the command list
 * from the user's choices; each command is typed into the workspace PTY so
 * the user watches every step happen, exactly like running them by hand.
 *
 *   1. materialize the project INTO the chat's empty workspace —
 *      `git clone …` (GitHub), a LINKED GIT WORKTREE with its own branch
 *      (local git repo — instant, space-efficient, T3-Code-inspired), or a
 *      server-side copy (non-git folder). Every chat gets its OWN checkout:
 *      two chats on the same project never share a directory (spec §36 —
 *      sharing is explicit, never the silent default).
 *   2. install packages         — detected from the manifest files present
 *   3. ACC + proagents setup    — context scaffold + AGENTS.md contract file
 *
 * The terminal is the single source of truth: its scrollback IS the setup log.
 */
import { promises as fs, readdirSync } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";

/** Directories that never make sense to copy into a fresh chat workspace. */
const COPY_EXCLUDES = ["node_modules", "dist", "coverage", ".git", ".paw", ".acc"];

export interface SetupStep {
  readonly label: string;
  readonly command: string;
}

/**
 * Write the git askpass helper the clone step uses for PRIVATE repos.
 *
 * The token must NEVER appear in a typed command (the PTY echoes every byte
 * into scrollback and shell history). Instead a tiny helper script is written
 * OUTSIDE the project (under <base>/.paw/) that reads the token from the
 * environment AT CALL TIME — the PTY child inherits the server's env, the
 * command line stays secret-free, and public repos never even invoke it
 * (git only consults askpass after a 401).
 *
 * Returns the script path when a token exists, null otherwise (public repos
 * clone without credentials; private ones fail honestly with exit 128).
 */
export async function ensureGitAskpass(baseDir: string): Promise<string | null> {
  const token = process.env.PAW_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token === undefined || token.length === 0) return null;
  const dir = path.join(baseDir, ".paw");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "git-askpass.sh");
  // No secret is written here — only a variable reference evaluated by git's
  // child process. 0700 so only the owning user can read/execute it.
  await fs.writeFile(
    file,
    [
      "#!/bin/sh",
      "case \"$1\" in",
      "  Username*) echo x-access-token ;;",
      "  Password*) echo \"${PAW_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}\" ;;",
      "esac",
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  return file;
}

/** Package-manager install command for the project shape on disk. */
function installCommand(root: string, files: readonly string[]): string | null {
  const has = (f: string) => files.includes(f);
  if (has("pnpm-lock.yaml")) return "pnpm install";
  if (has("package.json")) return "npm install";
  if (has("yarn.lock")) return "yarn install";
  if (has("package-lock.json")) return "npm ci";
  if (has("requirements.txt")) return "python3 -m pip install -r requirements.txt";
  if (has("pyproject.toml")) return "python3 -m pip install -e .";
  if (has("Gemfile")) return "bundle install";
  if (has("go.mod")) return "go mod download";
  if (has("Cargo.toml")) return "cargo fetch";
  if (has("Makefile")) return null; // nothing standard; leave to the user
  void root;
  return null;
}

/**
 * Build the real setup command list for a workspace about to be provisioned.
 * `absoluteRoot` is the chat's OWN workspace root — the project is
 * materialized INTO it (clone, or per-chat copy of the picked folder), so
 * two chats never share a directory. Only reading the manifest listing
 * needs fs; every mutation happens through the terminal commands returned
 * here.
 *
 * `askpassPath` (optional) prefixes the clone with GIT_ASKPASS so private
 * repos authenticate through the environment — the command text itself
 * carries no credentials. GIT_TERMINAL_PROMPT=0 makes git fail fast instead
 * of hanging on an interactive prompt it can never get (we await the PTY).
 */
export function planSetup(request: {
  source: "local" | "github";
  /** For github: the CLEAN clone URL to run in the parent terminal first. */
  cloneUrl?: string;
  /**
   * For local folders: the folder to materialize INTO the workspace. Every
   * chat gets its own checkout — the source folder is never bound in place
   * (two chats on one folder must not mix).
   */
  copyFrom?: string;
  /** Local folder is a git repo → materialize as a linked worktree + own branch. */
  gitWorktree?: boolean;
  /** Branch name for the per-chat worktree (defaults to a chat branch). */
  branch?: string;
  absoluteRoot: string;
  /** Base-dir-relative root, for echo'd context in the terminal. */
  displayRoot: string;
  /** Path to the askpass helper for private-repo auth (never the token). */
  askpassPath?: string;
}): SetupStep[] {
  const steps: SetupStep[] = [];

  if (request.source === "github" && request.cloneUrl !== undefined) {
    const envPrefix = request.askpassPath !== undefined
      ? `GIT_ASKPASS=${shellQuote(request.askpassPath)} GIT_TERMINAL_PROMPT=0 `
      : "GIT_TERMINAL_PROMPT=0 ";
    steps.push({ label: "clone repository", command: `${envPrefix}git clone ${request.cloneUrl} .` });
  }

  if (request.source === "local" && request.copyFrom !== undefined) {
    // Local GIT repo → a linked git worktree with its own branch (the
    // T3-Code worktree model: per-thread checkout + branch, instant, no
    // duplicate object store). Non-git folders → a plain per-chat copy.
    if (request.gitWorktree === true) {
      steps.push({
        label: "create git worktree",
        command: worktreeAddCommand(request.copyFrom, request.absoluteRoot, request.branch),
      });
    } else {
      steps.push({
        label: "copy project into workspace",
        command: tarCopyCommand(request.copyFrom, request.absoluteRoot),
      });
    }
  }

  // Synchronous manifest scan to pick the installer. After the copy step the
  // copied tree's manifest is detectable directly (the copy precedes this in
  // the terminal sequence); for a fresh clone the packages install after the
  // clone command runs.
  let files: string[] = [];
  if (request.source === "local" && request.copyFrom === undefined) {
    try {
      files = readdirSync(request.absoluteRoot);
    } catch {
      files = [];
    }
  }
  const install = installCommand(request.absoluteRoot, files);
  if (install !== null) {
    steps.push({ label: "install packages", command: install });
  } else if (request.copyFrom !== undefined || request.source === "github") {
    // Fresh clone: the manifest is only knowable AFTER the clone, so the
    // install step detects the package manager inside the terminal itself.
    steps.push({
      label: "install packages (detected after clone)",
      command: "if [ -f pnpm-lock.yaml ]; then pnpm install; elif [ -f yarn.lock ]; then yarn install; elif [ -f package.json ]; then npm install; elif [ -f requirements.txt ]; then python3 -m pip install -r requirements.txt; elif [ -f Gemfile ]; then bundle install; elif [ -f go.mod ]; then go mod download; elif [ -f Cargo.toml ]; then cargo fetch; fi",
    });
  }

  // ACC + proagents scaffold (idempotent, plain shell — no magic). Guards
  // keep an existing AGENTS.md / context file: a connected folder the user
  // owns must not be clobbered; a fresh clone gets both files.
  steps.push({
    label: "acc + proagents setup",
    command:
      "mkdir -p .acc/config" +
      " && { [ -f .acc/workspace-context.yaml ] || printf '%s\\n' 'context: acc' 'framework: proagents-workspace' > .acc/workspace-context.yaml; }" +
      " && { [ -f AGENTS.md ] || printf '%s\\n' '# ProAgents Workspace' '' 'This workspace is provisioned by ProAgents: agents work in isolated environments,' 'with ACC as the context framework. See .acc/workspace-context.yaml.' > AGENTS.md; }" +
      " && echo 'ACC + proagents scaffold ready'",
  });

  void request.displayRoot;
  return steps;
}

/** Quote a path for safe use in a POSIX shell word. */
function shellQuote(value: string): string {
  return `"${value.replace(/(["$\\`])/g, "\\$1")}"`;
}

/**
 * The copy command that materializes a non-git local folder INTO the chat's
 * empty workspace. `tar` streams the tree server-free (one child process,
 * preserves dotfiles by default) while excluding everything that must never
 * cross a chat boundary: dependencies (node_modules), build output (dist,
 * coverage), and the agent-state machinery (.git, .paw, .acc) — a chat
 * inherits the project's CODE, not another workspace's state.
 */
function tarCopyCommand(from: string, to: string): string {
  const excludeFlags = COPY_EXCLUDES.map((d) => `--exclude='/${d}'`).join(" ");
  return `mkdir -p ${shellQuote(to)} && tar -C ${shellQuote(from)} ${excludeFlags} -cf - . | tar -C ${shellQuote(to)} -xf - && echo 'project copied into workspace'`;
}

/**
 * The worktree command that materializes a local GIT repo INTO the chat's
 * empty workspace (T3-Code worktree model, per-thread checkout): a NEW branch
 * is created for this chat and checked out into the chat's own directory —
 * the source repo keeps working untouched on its own branch. The branch name
 * is sanitized like T3 does (slashes → dashes) so nested paths stay flat.
 */
function worktreeAddCommand(repo: string, to: string, branch?: string): string {
  const repoName = path.basename(repo);
  const safeBranch = (branch ?? `chat/${repoName}-${Math.random().toString(36).slice(2, 8)}`).replace(/\//g, "-");
  return `git -C ${shellQuote(repo)} worktree add -b ${safeBranch} ${shellQuote(to)} && echo 'worktree ready (branch ${safeBranch})'`;
}

/**
 * Assert a clone URL is a plain https git URL with NO embedded credentials —
 * the URL is typed into the PTY and echoed into scrollback/history, so a
 * token inside it would be a secret leak. Auth goes through GIT_ASKPASS.
 */
export function assertCloneTarget(url: string): string {
  if (url.includes("@") && /^https:\/\/[^/]*@/.test(url)) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: "Refusing to clone: the URL embeds credentials (they would be echoed into the terminal).",
      recoverable: true,
      suggestions: ["Use a clean https URL — auth is handled by GIT_ASKPASS from the environment"],
    });
  }
  if (!/^https:\/\/[^\s]+\.git$/.test(url) && !/^https:\/\/[^\s]+\/[^\s]+$/.test(url)) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: "Refusing to clone: not an https git URL.",
      recoverable: true,
      suggestions: ["Use https://github.com/owner/repo.git"],
    });
  }
  return url;
}
