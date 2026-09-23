/**
 * Lifecycle definition plugin (spec sections 6/16/146) — contributes the
 * `web-development` lifecycle to the workspace's lifecycle library.
 *
 * Plugin-first: a lifecycle plugin is pure DATA. It cannot execute anything,
 * cannot intercept the lifecycle engine, and cannot mutate runs — the kernel
 * lifecycle engine remains the sole authority over sequencing, policies, and
 * gates. This plugin only makes a reusable workflow available for
 * configuration to reference (`lifecycle.default: web-development` or a
 * workspace entry's `lifecycle.ref`).
 */
import { definePlugin } from "@proagents/workspace";
import type { DevelopmentLifecycle, PluginDefinition } from "@proagents/workspace";

const WEB_LIFECYCLE: DevelopmentLifecycle = {
  id: "web-development",
  name: "Web development lifecycle",
  description: "Understand → Plan → Implement → Test (unit + browser) → Review → Ship.",
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
      id: "plan",
      name: "Plan",
      type: "plan",
      agents: [{ profileId: "spec-editor", role: "planner" }],
      tools: [{ id: "repo-context", type: "search" }],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "implement",
      name: "Implement",
      type: "implement",
      agents: [{ profileId: "nodejs-engineer", role: "implementer" }],
      tools: [
        { id: "terminal", type: "terminal" },
        { id: "files", type: "filesystem" },
        { id: "git", type: "git" },
      ],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "unit-tests",
      name: "Unit tests",
      type: "test",
      agents: [{ profileId: "verification-engineer", role: "tester" }],
      tools: [{ id: "terminal", type: "terminal" }, { id: "vitest", type: "vitest" }],
      policy: { parallel: false, required: false, onFailure: "continue", maxRetries: 2 },
    },
    {
      id: "browser-tests",
      name: "Browser tests",
      type: "test",
      agents: [{ profileId: "verification-engineer", role: "tester" }],
      tools: [{ id: "playwright", type: "playwright" }, { id: "browser", type: "browser" }],
      policy: { parallel: false, required: false, onFailure: "continue", maxRetries: 1 },
    },
    {
      id: "review",
      name: "Review",
      type: "review",
      agents: [{ profileId: "security-reviewer", role: "reviewer" }],
      tools: [{ id: "git-diff", type: "git" }],
      policy: { parallel: false, required: false, onFailure: "continue", maxRetries: 1 },
    },
    {
      id: "ship",
      name: "Ship",
      type: "ship",
      agents: [],
      tools: [{ id: "git", type: "git" }, { id: "build", type: "terminal", config: { command: "pnpm build" } }],
      policy: { parallel: false, required: false, onFailure: "stop", maxRetries: 1 },
    },
  ],
};

export function lifecycleWebPlugin(): PluginDefinition {
  return definePlugin({
    manifest: {
      id: "lifecycle-web",
      provider: "web-development",
      name: "Web Development Lifecycle",
      version: "0.1.0",
      description: "Contributes the web-development lifecycle (understand → plan → implement → unit/browser test → review → ship).",
      capabilities: ["lifecycle"],
      dependencies: [],
      permissions: [],
      compatibility: { workspaceApi: "^1.0.0" },
      runtime: { kind: "service", label: "Web Development Lifecycle" },
    },
    activate() {
      // Pure data contribution — nothing to activate. Definitions flow
      // through `definitions()` below, resolved by the host.
    },
    definitions: () => [WEB_LIFECYCLE],
  });
}

export const lifecycleWebDefinition: DevelopmentLifecycle = WEB_LIFECYCLE;
