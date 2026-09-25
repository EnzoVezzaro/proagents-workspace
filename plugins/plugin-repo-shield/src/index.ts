/**
 * Repo Shield protection plugin (spec sections 101–102).
 *
 * A cross-cutting protection provider: it subscribes to the kernel's
 * before-execution events (`command/before`, `filesystem/before-write`) and
 * throws to veto an operation BEFORE it executes — intervention, not logging.
 * It also registers the Protection capability so other code can evaluate
 * operations ahead of time via `services.get(protectionDefinition)`.
 */
import { definePlugin, defineService, WorkspaceError } from "@proagents/workspace";
import type {
  ProtectionDecision,
  ProtectionProvider,
  ProtectionRequest,
  ProviderHealth,
} from "@proagents/workspace";

const repoShieldDefinition = defineService<ProtectionProvider>({
  id: "protection",
  contractVersion: "1.0.0",
  requiredPermissions: [],
});

/**
 * Canonicalize a command/path for matching: lowercase and collapse runs of
 * whitespace, so `GIT PUSH --force`, `git   push  -f` and `git -C <dir>
 * PUSH -f` are all caught. Lowercasing only affects pattern matching, never
 * the operation itself.
 */
const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Shell commands whose very presence is destructive. */
const DESTRUCTIVE_COMMAND_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /^git(?: -c \S+)* push\b.*(?:\s-f\b|--force(?:-with-lease)?\b)/, reason: "force push rewrites remote history" },
  { pattern: /^git(?: -c \S+)* push\b.*(?:\s-d\b|--delete\b)/, reason: "deleting a remote ref rewrites history" },
  { pattern: /^git(?: -c \S+)* reset\b.*\s--hard\b/, reason: "hard reset discards working-tree changes" },
  { pattern: /^git(?: -c \S+)* clean\b.*\s-[dxf]{1,3}\b/, reason: "clean -f deletes untracked files" },
  { pattern: /^git(?: -c \S+)* branch\b.*(?:\s-[dD]\b|--delete\b)/, reason: "branch deletion can lose commits" },
  { pattern: /^git(?: -c \S+)* tag\b.*(?:\s-[dD]\b|--delete\b)/, reason: "tag deletion can lose release markers" },
  { pattern: /^git(?: -c \S+)* rebase\b/, reason: "rebase rewrites history" },
  { pattern: /\brm -rf \/(?!tmp\b)/, reason: "recursive delete at filesystem root" },
  { pattern: /\b(mkfs|shutdown|reboot)\b/, reason: "host-level destructive command" },
];

/** Paths protection never lets plugins write. */
const PROTECTED_PATHS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\/)\.git(\/|$)/, reason: "direct .git manipulation bypasses the repository provider" },
  { pattern: /(^|\/)\.env(rc)?(\/|$|\.)/, reason: "credential files must change through the secrets provider" },
  { pattern: /(^|\/)paw-lock\.json$/, reason: "the lockfile is kernel-owned" },
];

/**
 * Enforcement posture (DISTRIBUTION.md section 7). The mode is DECLARED
 * configuration, so it is honoured — a configured `off` that still blocks is
 * a lie about the policy the operator wrote.
 *
 * `off`    — not enforced; nothing is recorded either.
 * `audit`  — recorded (`protection/intervened`), never blocks.
 * `warn`   — recorded and surfaced as a reason, never blocks.
 * `guarded`/`strict` — a violating operation is refused. `guarded` is the
 *            default; both refuse, and `strict` additionally refuses the
 *            approval path for network egress.
 */
type EnforcementMode = "off" | "audit" | "warn" | "guarded" | "strict";

function evaluate(request: ProtectionRequest, mode: EnforcementMode = "guarded"): ProtectionDecision {
  if (mode === "off") {
    return { action: "allow", reason: "protection is off (protection.mode: off)" };
  }
  const op = request.operation.toLowerCase();
  const haystack = [
    request.target,
    String(request.details?.["command"] ?? ""),
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map(normalize)
    .join(" ");

  const refuse = (reason: string): ProtectionDecision => {
    if (mode === "audit" || mode === "warn") {
      return { action: "allow", reason: `${reason} (recorded only: protection.mode: ${mode})` };
    }
    return { action: "block", reason: `blocked: ${reason} (spec section 35)` };
  };

  for (const rule of DESTRUCTIVE_COMMAND_PATTERNS) {
    if (rule.pattern.test(haystack)) {
      return refuse(rule.reason);
    }
  }
  if (op.startsWith("filesystem")) {
    for (const rule of PROTECTED_PATHS) {
      if (rule.pattern.test(normalize(request.target))) {
        return refuse(rule.reason);
      }
    }
  }
  if (op.startsWith("network")) {
    if (mode === "strict") {
      return { action: "block", reason: "blocked: network egress is disabled (protection.mode: strict)" };
    }
    if (mode === "audit" || mode === "warn") {
      return { action: "allow", reason: `network egress (recorded only: protection.mode: ${mode})` };
    }
    return { action: "requires-approval", reason: "network egress requires explicit approval (least privilege)" };
  }
  return { action: "allow", reason: "no protection rule matched" };
}

/** Read the declared enforcement posture, defaulting to the safe `guarded`. */
function enforcementMode(configured: unknown): EnforcementMode {
  return configured === "off" || configured === "audit" || configured === "warn" || configured === "strict"
    ? configured
    : "guarded";
}

export const repoShieldPlugin = definePlugin({
  manifest: {
    id: "repo-shield",
    provider: "repo-shield",
    name: "Repo Shield",
    version: "0.1.0",
    description: "Protection layer that vetoes destructive operations before they execute",
    capabilities: ["protection"],
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0", protectionContract: "^1.0.0" },
  },
  activate(ctx) {
    // The declared posture is read ONCE at activation: enforcement strength
    // is a policy fact, not a per-call dial.
    const mode = enforcementMode(ctx.config["protection"]?.["mode"]);
    const decide = (request: ProtectionRequest): ProtectionDecision => evaluate(request, mode);

    const provider: ProtectionProvider = {
      name: "repo-shield",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        if (mode === "off") {
          return { status: "degraded", message: "protection is disabled (protection.mode: off) — nothing is enforced" };
        }
        // The self-test must be evaluated under the posture that will
        // actually be enforced, or health would claim a strict guarantee
        // the configuration just turned off.
        const probe = decide({ operation: "protection.evaluate", target: "git push --force" });
        return probe.action === "block"
          ? { status: "healthy", message: `protection rules loaded (self-test passed, mode: ${mode})` }
          : { status: "degraded", message: `self-test failed under protection.mode: ${mode}` };
      },
      evaluate: async (request: ProtectionRequest): Promise<ProtectionDecision> => decide(request),
    };

    ctx.services.register(repoShieldDefinition, provider, "repo-shield");

    // Before-execution veto chain: the kernel event bus awaits subscribers,
    // so throwing here blocks the operation BEFORE it runs (spec 101–102).
    // In `audit`/`warn` the decision is recorded and execution continues —
    // the reason travels on `protection/intervened` either way.
    ctx.events.on("command/before", async (payload) => {
      const decision = decide({ operation: "command", target: payload.command });
      if (decision.action !== "block") {
        if (mode === "audit" || mode === "warn") {
          await ctx.events.emit("protection/intervened", {
            operation: "command",
            target: payload.command,
            action: "recorded",
          });
        }
        return;
      }
      await ctx.events.emit("protection/intervened", {
        operation: "command",
        target: payload.command,
        action: "blocked",
      });
      throw vetoError(decision.reason);
    });

    ctx.events.on("filesystem/before-write", async (payload) => {
      const decision = decide({ operation: "filesystem.write", target: payload.path });
      if (decision.action !== "block") {
        if (mode === "audit" || mode === "warn") {
          await ctx.events.emit("protection/intervened", {
            operation: "filesystem.write",
            target: payload.path,
            action: "recorded",
          });
        }
        return;
      }
      await ctx.events.emit("protection/intervened", {
        operation: "filesystem.write",
        target: payload.path,
        action: "blocked",
      });
      throw vetoError(decision.reason);
    });
  },
});

/** Structured veto so the CLI classifies it as PROTECTION_BLOCKED. */
function vetoError(reason: string): WorkspaceError {
  return new WorkspaceError({
    code: "PROTECTION_BLOCKED",
    message: `PROTECTION_BLOCKED: ${reason}`,
    provider: "repo-shield",
    recoverable: false,
    suggestions: [
      "Avoid the destructive operation",
      "Adjust repository.options.guards if the operation is intentional",
    ],
  });
}
