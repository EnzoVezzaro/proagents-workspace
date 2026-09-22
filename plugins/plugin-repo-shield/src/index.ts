/**
 * Repo Shield protection plugin (spec sections 101–102).
 *
 * A cross-cutting protection provider: it subscribes to the kernel's
 * before-execution events (`command/before`, `filesystem/before-write`) and
 * throws to veto an operation BEFORE it executes — intervention, not logging.
 * It also registers the Protection capability so other code can evaluate
 * operations ahead of time via `services.get(protectionDefinition)`.
 */
import { definePlugin, defineService } from "@proagents/workspace";
import type {
  ProtectionAction,
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

/** Shell commands whose very presence is destructive. */
const DESTRUCTIVE_COMMAND_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /\bgit\s+push\b.*--force\b/, reason: "force push rewrites remote history" },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: "hard reset discards working-tree changes" },
  { pattern: /\bgit\s+clean\s+-fd\b/, reason: "clean -fd deletes untracked files" },
  { pattern: /\bgit\s+branch\s+-[dD]\b/, reason: "branch deletion can lose commits" },
  { pattern: /\bgit\s+tag\s+-d\b/, reason: "tag deletion can lose release markers" },
  { pattern: /\bgit\s+rebase\b/, reason: "rebase rewrites history" },
  { pattern: /\brm\s+-rf\s+\/(?!tmp\b)/, reason: "recursive delete at filesystem root" },
  { pattern: /\b(mkfs|shutdown|reboot)\b/, reason: "host-level destructive command" },
];

/** Paths protection never lets plugins write. */
const PROTECTED_PATHS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /\.git/, reason: "direct .git manipulation bypasses the repository provider" },
  { pattern: /\.env($|\.)/, reason: "credential files must change through the secrets provider" },
  { pattern: /(^|\/)paw-lock\.json$/, reason: "the lockfile is kernel-owned" },
];

function evaluate(request: ProtectionRequest): ProtectionDecision {
  const op = request.operation.toLowerCase();

  for (const rule of DESTRUCTIVE_COMMAND_PATTERNS) {
    if (rule.pattern.test(request.target) || rule.pattern.test(String(request.details?.["command"] ?? ""))) {
      return {
        action: op === "protection.evaluate" ? "block" : "block",
        reason: `blocked: ${rule.reason} (spec section 35)`,
      };
    }
  }
  if (op.startsWith("filesystem")) {
    for (const rule of PROTECTED_PATHS) {
      if (rule.pattern.test(request.target)) {
        return { action: "block", reason: `blocked: ${rule.reason}` };
      }
    }
  }
  if (op.startsWith("network")) {
    return { action: "requires-approval", reason: "network egress requires explicit approval (least privilege)" };
  }
  return { action: "allow", reason: "no protection rule matched" };
}

export const repoShieldPlugin = definePlugin({
  manifest: {
    id: "repo-shield",
    name: "Repo Shield",
    version: "0.1.0",
    description: "Protection layer that vetoes destructive operations before they execute",
    capabilities: ["protection"],
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0", protectionContract: "^1.0.0" },
  },
  activate(ctx) {
    const provider: ProtectionProvider = {
      name: "repo-shield",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        const probe = evaluate({ operation: "protection.evaluate", target: "git push --force" });
        return probe.action === "block"
          ? { status: "healthy", message: "protection rules loaded (self-test passed)" }
        : { status: "degraded", message: "self-test failed: destructive command was not blocked" };
      },
      evaluate: async (request: ProtectionRequest): Promise<ProtectionDecision> => evaluate(request),
    };

    ctx.services.register(repoShieldDefinition, provider, "repo-shield");

    // Before-execution veto chain: the kernel event bus awaits subscribers,
    // so throwing here blocks the operation BEFORE it runs (spec 101–102).
    ctx.events.on("command/before", (payload) => {
      const decision = evaluate({
        operation: "command",
        target: payload.command,
      });
      if (decision.action === "block") {
        void ctx.events.emit("protection/intervened", {
          operation: "command",
          target: payload.command,
          action: "blocked",
        });
        throw new Error(`PROTECTION_BLOCKED: ${decision.reason}`);
      }
    });

    ctx.events.on("filesystem/before-write", (payload) => {
      const decision = evaluate({
        operation: "filesystem.write",
        target: payload.path,
      });
      if (decision.action === "block") {
        void ctx.events.emit("protection/intervened", {
          operation: "filesystem.write",
          target: payload.path,
          action: "blocked",
        });
        throw new Error(`PROTECTION_BLOCKED: ${decision.reason}`);
      }
    });
  },
});
