/**
 * Bundled plugin registry for the CLI.
 *
 * The CLI ships with the V1 plugins; each activates only when the workspace
 * configuration references it (by id or capability), so `paw doctor` on a
 * plain config reports an empty set rather than booting everything.
 *
 * Convention-first note (spec section 148): the catalog includes ALL bundled
 * capability plugins, but activation is still config-driven — a zero-config
 * local workspace activates only the tools the configuration selects
 * (filesystem/shell/git by default).
 */
import type { PluginDefinition } from "@proagents/workspace";
import { filesystemPlugin } from "@proagents/plugin-filesystem";
import { shellPlugin } from "@proagents/plugin-shell";
import { gitPlugin } from "@proagents/plugin-git";
import { localRuntimePlugin } from "@proagents/plugin-runtime-local";
import { dockerRuntimePlugin } from "@proagents/plugin-runtime-docker";
import { accContextPlugin } from "@proagents/plugin-context-acc";
import { codexAgentPlugin } from "@proagents/plugin-agent-codex";
import { repoShieldPlugin } from "@proagents/plugin-repo-shield";
import { behaviorGatePlugin } from "@proagents/plugin-gate-behavior";
import { securityGatePlugin } from "@proagents/plugin-gate-security";
import { humanGatePlugin } from "@proagents/plugin-gate-human";
import { adversarialGatePlugin } from "@proagents/plugin-gate-adversarial";

export function bundledPlugins(): PluginDefinition[] {
  return [
    filesystemPlugin,
    shellPlugin,
    gitPlugin,
    localRuntimePlugin,
    dockerRuntimePlugin,
    accContextPlugin,
    codexAgentPlugin,
    repoShieldPlugin,
    // Checkpoint gates (spec section 150): resolved per gate kind/provider.
    behaviorGatePlugin,
    securityGatePlugin,
    humanGatePlugin,
    adversarialGatePlugin,
  ];
}
