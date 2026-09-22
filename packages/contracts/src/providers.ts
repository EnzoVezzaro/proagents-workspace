/**
 * Capability contracts (spec section 9 registry).
 *
 * These interfaces are the *only* thing the kernel knows about a capability.
 * Implementations are resolved through the service registry — never
 * instantiated directly. Contracts are append-only within a
 * major version; breaking changes require a version bump and a migration path
 * (versioning standard, spec sections 120–121).
 */
import type { ProviderHealth } from "./health.js";
import type { ApprovalMode, NetworkMode } from "./schemas.js";

/** Every provider implements a minimal common surface. */
export interface ProviderBase {
  /** Human-readable provider name for `paw doctor` and logs. */
  readonly name: string;
  /** Version of this contract the implementation declares (spec section 120). */
  readonly contractVersion: string;
  /** Health for `paw doctor` (spec sections 62–63). */
  health(): Promise<ProviderHealth>;
}

// ---------------------------------------------------------------------------
// Runtime (E2B, Docker, local; future: Kubernetes, Firecracker)
// ---------------------------------------------------------------------------

export interface RuntimeWorkspaceHandle {
  readonly workspaceId: string;
  readonly provider: string;
  /** Where the repository is mounted inside the runtime. */
  readonly repoPath: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RuntimeExecRequest {
  readonly command: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface RuntimeExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface RuntimeProvider extends ProviderBase {
  createWorkspace(request: { workspaceId: string; image?: string; options?: Record<string, unknown> }): Promise<RuntimeWorkspaceHandle>;
  execWorkspace(handle: RuntimeWorkspaceHandle, request: RuntimeExecRequest): Promise<RuntimeExecResult>;
  stopWorkspace(handle: RuntimeWorkspaceHandle): Promise<void>;
  destroyWorkspace(handle: RuntimeWorkspaceHandle): Promise<void>;
}

// ---------------------------------------------------------------------------
// Repository (GitHub, GitLab, generic Git)
// ---------------------------------------------------------------------------

export type GitOperation =
  | "clone"
  | "status"
  | "diff"
  | "commit"
  | "push"
  | "pull"
  | "branch"
  | "tag"
  | "remote"
  | "history-rewrite";

/** Operations the spec guards by default (spec section 35). */
export type GuardedGitOperation = Extract<
  GitOperation,
  "push" | "branch" | "tag" | "remote" | "history-rewrite"
>;

export interface GitGuardPolicy {
  /** Force push. */
  forcePush: boolean;
  /** Branch deletion. */
  branchDeletion: boolean;
  /** `git reset --hard`. */
  hardReset: boolean;
  /** `git clean -fd`. */
  cleanFd: boolean;
  /** Tag deletion. */
  tagDeletion: boolean;
  /** Remote add/remove/set-url. */
  remoteChanges: boolean;
  /** History rewriting (rebase, filter-branch, amend on pushed commits). */
  historyRewrite: boolean;
}

/** Conservative defaults (spec section 35: "Default behavior is conservative"). */
export const DEFAULT_GIT_GUARDS: GitGuardPolicy = {
  forcePush: false,
  branchDeletion: false,
  hardReset: false,
  cleanFd: false,
  tagDeletion: false,
  remoteChanges: false,
  historyRewrite: false,
};

export interface RepositoryProvider extends ProviderBase {
  clone(request: {
    repository: string;
    branch?: string;
    targetPath: string;
    depth?: number;
  }): Promise<{ path: string; commit: string }>;
  status(path: string): Promise<{ branch: string; dirty: boolean; files: readonly string[] }>;
  commit(request: { path: string; message: string; addAll: boolean }): Promise<{ commit: string }>;
  push(request: { path: string; remote?: string; branch?: string; force: boolean }): Promise<{ pushedTo: string }>;
  /** Evaluate whether an operation is allowed by the git guard policy. */
  guard(operation: GuardedGitOperation, options?: { force?: boolean }): { allowed: boolean; reason?: string };
}

// ---------------------------------------------------------------------------
// Context (ACC, filesystem, language-server)
// ---------------------------------------------------------------------------

export interface ContextPack {
  readonly provider: string;
  readonly entries: readonly { readonly id: string; readonly path: string; readonly summary: string }[];
}

export interface ContextProvider extends ProviderBase {
  index(paths: readonly string[]): Promise<void>;
  query(request: { text: string; limit?: number }): Promise<ContextPack>;
  inspect(): Promise<ContextPack>;
}

// ---------------------------------------------------------------------------
// Agent (Codex, Claude, OpenCode, Gemini, ProAgents)
// ---------------------------------------------------------------------------

export interface AgentSession {
  readonly sessionId: string;
  readonly provider: string;
}

export interface AgentPrompt {
  readonly text: string;
  readonly workingDirectory?: string;
}

export interface AgentResult {
  readonly exitCode: number;
  readonly output: string;
  readonly durationMs: number;
}

export interface AgentProvider extends ProviderBase {
  /** Is this agent provider usable in the current environment? */
  available(): Promise<boolean>;
  startSession(options?: { workingDirectory?: string }): Promise<AgentSession>;
  run(session: AgentSession, prompt: AgentPrompt): Promise<AgentResult>;
  stopSession(session: AgentSession): Promise<void>;
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

export interface FilesystemProvider extends ProviderBase {
  read(request: { path: string; encoding?: "utf8" | "base64" }): Promise<string>;
  write(request: { path: string; content: string }): Promise<{ bytes: number }>;
  list(request: { path: string; recursive?: boolean }): Promise<readonly string[]>;
  remove(request: { path: string; recursive?: boolean }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export interface ShellResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface ShellProvider extends ProviderBase {
  exec(request: { command: string; cwd?: string; env?: Readonly<Record<string, string>>; timeoutMs?: number }): Promise<ShellResult>;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export interface TerminalProvider extends ProviderBase {
  open(options?: { cwd?: string }): Promise<{ terminalId: string }>;
  write(terminalId: string, data: string): Promise<void>;
  resize(terminalId: string, cols: number, rows: number): Promise<void>;
  close(terminalId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface NetworkRule {
  readonly host: string;
  readonly port?: number;
}

export interface NetworkPolicy {
  readonly mode: NetworkMode;
  readonly allow: readonly string[];
}

export interface NetworkProvider extends ProviderBase {
  allow(rule: NetworkRule): Promise<void>;
  deny(rule: NetworkRule): Promise<void>;
  inspect(): Promise<NetworkPolicy>;
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export interface SecretReference {
  readonly name: string;
}

export interface SecretsProvider extends ProviderBase {
  /** Resolve a secret by reference; implementations never log values. */
  resolve(reference: SecretReference): Promise<string>;
  /** Which secret names may be resolved under current policy? */
  allowed(): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface StorageProvider extends ProviderBase {
  put(request: { key: string; value: string }): Promise<void>;
  get(request: { key: string }): Promise<string | undefined>;
  delete(request: { key: string }): Promise<void>;
  keys(): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export interface BrowserSession {
  readonly sessionId: string;
  readonly url?: string;
}

export interface BrowserProvider extends ProviderBase {
  launch(): Promise<BrowserSession>;
  navigate(session: string, url: string): Promise<void>;
  screenshot(session: string): Promise<Uint8Array>;
  close(session: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ToolInvocation {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface ToolProvider extends ProviderBase {
  listTools(): Promise<readonly ToolDescriptor[]>;
  invoke(tool: ToolInvocation): Promise<{ result: unknown }>;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerificationCommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly durationMs: number;
}

export interface VerificationReport {
  readonly ok: boolean;
  readonly results: readonly VerificationCommandResult[];
  readonly durationMs: number;
}

export interface VerificationProvider extends ProviderBase {
  run(request: { commands: readonly string[]; cwd?: string }): Promise<VerificationReport>;
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export type LogSeverity = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  readonly timestamp: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly provider?: string;
  readonly operation: string;
  readonly severity: LogSeverity;
  readonly durationMs?: number;
  readonly result?: string;
  readonly message?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

export interface ObservabilityProvider extends ProviderBase {
  write(record: LogRecord): Promise<void>;
  query(request: { workspaceId?: string; severity?: LogSeverity; limit?: number }): Promise<readonly LogRecord[]>;
}

// ---------------------------------------------------------------------------
// Protection (Repo Shield layer — cross-cutting, spec sections 101–102)
// ---------------------------------------------------------------------------

export type ProtectionAction = "allow" | "block" | "requires-approval";

export interface ProtectionDecision {
  readonly action: ProtectionAction;
  readonly reason: string;
}

export interface ProtectionRequest {
  readonly operation: string;
  readonly target: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ProtectionProvider extends ProviderBase {
  /** Evaluate BEFORE the operation executes (spec sections 101–102). */
  evaluate(request: ProtectionRequest): Promise<ProtectionDecision>;
}

// ---------------------------------------------------------------------------
// Distribution (reposell layer — cross-cutting)
// ---------------------------------------------------------------------------

export interface DistributionProvider extends ProviderBase {
  inspect(): Promise<{ licensed: boolean; plan?: string }>;
  prepare(request: { artifact: string }): Promise<{ ready: boolean }>;
  verify(request: { artifact: string }): Promise<{ valid: boolean }>;
}

// ---------------------------------------------------------------------------
// Capability registry ids (spec section 9)
// ---------------------------------------------------------------------------

export const CAPABILITIES = [
  "runtime",
  "repository",
  "context",
  "agent",
  "filesystem",
  "shell",
  "terminal",
  "network",
  "secrets",
  "storage",
  "browser",
  "tool",
  "verification",
  "observability",
  "protection",
  "distribution",
] as const;

export type CapabilityId = (typeof CAPABILITIES)[number];

/** Approval modes re-exported for convenience in provider signatures. */
export type { ApprovalMode, NetworkMode };
