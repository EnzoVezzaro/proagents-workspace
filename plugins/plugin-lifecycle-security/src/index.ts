/**
 * Lifecycle definition plugin (spec sections 6/16/146) — contributes the
 * `security-audit` lifecycle: a review-heavy workflow without implementation
 * stages, for risk-sensitive work on an existing codebase.
 *
 * Pure data, like every lifecycle plugin: the kernel engine stays the sole
 * authority over execution; this plugin only contributes the definition.
 */
import { definePlugin } from "@proagents/workspace";
import type { DevelopmentLifecycle, PluginDefinition } from "@proagents/workspace";

const SECURITY_LIFECYCLE: DevelopmentLifecycle = {
  id: "security-audit",
  name: "Security audit lifecycle",
  description: "Understand → Static review → Threat model → Verify findings → Report.",
  stages: [
    {
      id: "understand",
      name: "Understand",
      type: "understand",
      agents: [{ profileId: "generalist", role: "explorer" }],
      tools: [{ id: "repo-context", type: "search" }],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "static-review",
      name: "Static review",
      type: "review",
      agents: [{ profileId: "security-reviewer", role: "auditor" }],
      tools: [{ id: "files", type: "filesystem" }, { id: "git-diff", type: "git" }],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "threat-model",
      name: "Threat model",
      type: "review",
      agents: [{ profileId: "security-reviewer", role: "threat-modeler" }],
      tools: [],
      policy: { parallel: false, required: true, onFailure: "retry", maxRetries: 2 },
    },
    {
      id: "verify-findings",
      name: "Verify findings",
      type: "test",
      agents: [{ profileId: "verification-engineer", role: "exploit-verifier" }],
      tools: [{ id: "terminal", type: "terminal" }],
      policy: { parallel: false, required: false, onFailure: "continue", maxRetries: 1 },
    },
    {
      id: "report",
      name: "Report",
      type: "custom",
      agents: [{ profileId: "spec-editor", role: "reporter" }],
      tools: [],
      policy: { parallel: false, required: true, onFailure: "continue", maxRetries: 1 },
    },
  ],
};

export function lifecycleSecurityPlugin(): PluginDefinition {
  return definePlugin({
    manifest: {
      id: "lifecycle-security",
      provider: "security-audit",
      name: "Security Audit Lifecycle",
      version: "0.1.0",
      description: "Contributes the security-audit lifecycle (understand → static review → threat model → verify → report).",
      capabilities: ["lifecycle"],
      dependencies: [],
      permissions: [],
      compatibility: { workspaceApi: "^1.0.0" },
      runtime: { kind: "service", label: "Security Audit Lifecycle" },
    },
    activate() {
      // Pure data contribution — nothing to activate.
    },
    definitions: () => [SECURITY_LIFECYCLE],
  });
}

export const lifecycleSecurityDefinition: DevelopmentLifecycle = SECURITY_LIFECYCLE;
