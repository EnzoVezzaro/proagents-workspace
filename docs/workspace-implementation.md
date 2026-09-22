# Workspace Implementation

> Status: implemented in this repository (`packages/` + `plugins/`), versioned
> as 0.1.0. This page describes the working TypeScript implementation of the
> architecture in [Architecture](./architecture.md); the canonical product
> specification remains `README.md`.

The Workspace ships as a **small kernel plus plugins**. The kernel contains no
provider-specific logic — every runtime, repository, context, agent, and
protection behavior is a plugin discovered through the service registry
(spec section 139, kernel purity).

## Packages

| Package | npm name | Purpose |
|---|---|---|
| `packages/contracts` | `@proagents/contracts` | The 16 capability contracts, stable error codes, typed event map, Zod schemas for `workspace.yaml` and plugin manifests. |
| `packages/kernel` | `@proagents/kernel` | Event bus, service/capability registries, plugin discovery and dependency resolution, lifecycle state machine, permission framework, health aggregation, structured logging. |
| `packages/sdk` | `@proagents/workspace` | `definePlugin` + `WorkspaceClient` — the surface plugins and integrations depend on. |
| `packages/cli` | `proagents-workspace` | The `paw` CLI binary. |

## Bundled plugins

| Plugin | Capability | Honest behavior |
|---|---|---|
| `filesystem` | filesystem | Sandboxed to its configured root; protection can veto writes before bytes hit the disk. |
| `shell` | shell | Every command emits `command/before` and awaits it; dangerous commands pass the approval policy and fail closed headless. |
| `git` | repository | Force push, branch/tag deletion, remote changes and history rewrite are **blocked by default** (spec section 35); enabling them is an explicit config decision plus an approval. |
| `runtime-local` | runtime | The zero-cloud default. It is **not a sandbox** and never claims to be one. |
| `runtime-docker` | runtime | Isolated containers; reports `unavailable` honestly when docker is absent; never falls back silently to local execution. |
| `context-acc` | context | Indexes `.acc/` context packs and serves ranked queries. |
| `agent-codex` | agent | Wraps the `codex` CLI with availability detection; missing binary → `AGENT_PROVIDER_UNAVAILABLE`, not silent failure. |
| `repo-shield` | protection | Subscribes to `command/before` and `filesystem/before-write`, vetoing destructive operations **before** they execute (spec sections 101–102). |

## Quick start

```bash
pnpm install
pnpm build

# Health of config-referenced plugins (empty set on a plain config)
node packages/cli/dist/index.js doctor --json

# Which plugins activated, and which services they provide
PAW_PLUGINS=filesystem,shell node packages/cli/dist/index.js plugin list --json
PAW_PLUGINS=filesystem,shell node packages/cli/dist/index.js service list --json
```

The CLI's bundled plugins form a **catalog**: a plugin activates only when the
workspace configuration references it — by plugin id, capability, or provider
selection. This is why `paw doctor` on a plain configuration reports an empty
set rather than booting every bundled plugin.

## Authoring a plugin

```ts
import { definePlugin, defineService, type StorageProvider } from "@proagents/workspace";

const storageDefinition = defineService<StorageProvider>({ id: "storage", contractVersion: "1.0.0" });

export const myStoragePlugin = definePlugin({
  manifest: {
    id: "my-storage",
    name: "My Storage",
    version: "0.1.0",
    capabilities: ["storage"],
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0" },
  },
  activate(ctx) {
    ctx.services.register(storageDefinition, {
      name: "my-storage",
      contractVersion: "1.0.0",
      health: async () => ({ status: "healthy", message: "ready" }),
      put: async () => {},
      get: async () => undefined,
      delete: async () => {},
      keys: async () => [],
    }, "my-storage");
  },
});
```

Rules the kernel enforces for every plugin:

1. **Manifests are Zod-validated** — capabilities, dependencies, permissions
   and compatibility ranges (spec section 59).
2. **Permissions are declarative** — manifest requests are intersected with
   `workspace.yaml` grants; a plugin can refine scoped requests during
   activation but can never self-grant.
3. **Before-execution events are awaited** — a subscriber that throws vetoes
   the operation *before* it runs. Protection is intervention, not logging.
4. **One provider per capability** — a second registration of the same
   service id fails with `SERVICE_ALREADY_REGISTERED`.

## Verification

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The suite includes per-plugin contract tests (guards, honesty, veto chains)
and an integration test that walks the full lifecycle flow from the
specification: local runtime → clone → context → edit → test → commit →
guarded push, with Repo Shield vetoing destructive operations in-band.

## See also

- [Architecture](./architecture.md) — kernel/services/events model
- [Configuration](./configuration.md) — `workspace.yaml` reference
- [Security](./security.md) — permission and protection model
- [CLI Reference](./cli-reference.md) — the fixed `paw` vocabulary
