# AGENTS.md — plugins/

Functionality-local contract for ProAgents Workspace capability plugins.
Read the root `AGENTS.md` and `packages/AGENTS.md` first.

## Ownership

Owner: proagents-workspace maintainers

## Dependencies

- packages/ (capability contracts and the SDK surface plugins are built on)
- docs/ (provider documentation that must stay in sync with the plugins)

## What a plugin is

A plugin bundles a Zod-validated manifest (spec section 59) with an
`activate/deactivate` pair (SDK `definePlugin`). It registers capability
implementations through the plugin context's service registry and integrates
with other plugins only through the typed event bus — plugins never import
each other.

## The V1 plugin set

| Plugin id | Capability | Contract | Notes |
|---|---|---|---|
| `filesystem` | filesystem | 1.0.0 | Sandboxed to its configured root; refines effective permissions via `refinePlugin`; awaits `filesystem/before-write`. |
| `shell` | shell | 1.0.0 | Awaits `command/before`; dangerous commands pass the approval policy; fails closed headless. |
| `git` | repository | 1.0.0 | Conservative guards (spec section 35) — force push, branch/tag deletion, remote changes, history rewrite blocked unless enabled under `repository.options.guards`; guarded-but-allowed ops still pass approval. |
| `runtime-local` | runtime | 1.0.0 | Zero-cloud default; **never claims to be a sandbox**; rejects container images honestly. |
| `runtime-docker` | runtime | 1.0.0 | Isolated containers; honest `unavailable` health when docker is missing; never silently falls back to local exec. |
| `context-acc` | context | 1.0.0 | Indexes `.acc/` packs; degraded health when `.acc/` is absent. |
| `agent-codex` | agent | 1.0.0 | Wraps the `codex` CLI; honest availability detection; `AGENT_PROVIDER_UNAVAILABLE` when missing. |
| `repo-shield` | protection | 1.0.0 | Cross-cutting; subscribes to `command/before` and `filesystem/before-write` and vetoes destructive operations BEFORE execution (spec sections 101–102). |

## Rules

- Register under the **capability id** from `CAPABILITIES` (spec section 9),
  e.g. the git plugin registers service id `repository`.
- Every plugin ships a contract test suite in `test/` that pins its guard and
  honesty behavior, not just happy paths.
- Health must be truthful: report `degraded`/`unavailable` with actionable
  messages rather than pretending.
- Destructive defaults are conservative; enabling them is always an explicit
  configuration decision.

## Commands

```bash
pnpm --filter @proagents/plugin-git test    # one plugin's suite
pnpm -r --workspace-concurrency=1 build     # all packages in dependency order
```
