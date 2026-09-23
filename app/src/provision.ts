/**
 * Launch provisioning pipeline — executed as REAL commands in the workspace's
 * REAL terminal (no simulated exec). The wizard composes the command list
 * from the user's choices; each command is typed into the workspace PTY so
 * the user watches every step happen, exactly like running them by hand.
 *
 *   1. materialize the project  — `git clone …` (GitHub, guarded git) or bind
 *                                 the picked folder (no copy: agents work in
 *                                 the folder itself)
 *   2. install packages         — detected from the manifest files present
 *   3. ACC + proagents setup    — context scaffold + AGENTS.md contract file
 *
 * The terminal is the single source of truth: its scrollback IS the setup log.
 */
import { promises as fs, readdirSync } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";

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
 * `absoluteRoot` is the workspace root (== project root for GitHub projects;
 * for a local folder the workspace IS the folder — agents never work on a
 * copy). Only reading the manifest listing needs fs; every mutation happens
 * through the terminal commands returned here.
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

  // Synchronous manifest scan to pick the installer (local folders only —
  // for a fresh clone the packages install after the clone command runs).
  let files: string[] = [];
  if (request.source === "local") {
    try {
      files = readdirSync(request.absoluteRoot);
    } catch {
      files = [];
    }
  }
  const install = installCommand(request.absoluteRoot, files);
  if (install !== null) {
    steps.push({ label: "install packages", command: install });
  } else if (request.source === "github") {
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
