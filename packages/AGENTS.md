# AGENTS.md — packages/ (kernel, contracts, SDK, CLI)

Functionality-local contract for the TypeScript implementation of the
ProAgents Workspace kernel. Read the root `AGENTS.md` first; this file adds
package-specific rules.

## Ownership

Owner: proagents-workspace maintainers

## Dependencies

- docs/ (documentation the CLI vocabulary and output shapes must stay
  consistent with)
- plugins/ — consumed by the CLI only, never by the kernel or SDK. This edge
  closes the intentional monorepo cycle `packages → plugins → packages`
  (review surface, ACC014): plugins build on the SDK, the CLI ships the
  catalog. Kernel-purity limits that cycle to a single leaf consumer, so
  packages/cli is the only package that ever imports a plugin.

## Layout

| Path | Package | Role |
|---|---|---|
| `packages/contracts` | `@proagents/contracts` | Capability contracts, stable error codes, typed event map, Zod schemas (`workspace.yaml`, plugin manifest), service definitions. Zero runtime logic beyond schemas and error types. |
| `packages/kernel` | `@proagents/kernel` | Event bus, service + capability registries, plugin discovery/dependency resolution, lifecycle state machine, permission framework, command registry, health aggregation, structured logging. **No provider-specific logic.** |
| `packages/sdk` | `@proagents/workspace` | The authoring surface: `definePlugin`, `WorkspaceClient`. Re-exports contracts + kernel. Everything plugins depend on. |
| `packages/cli` | `proagents-workspace` (binary `paw`) | Thin CLI over the SDK: `doctor`, `plugin list`, `service list`, `config show`, `verify`. `--json` everywhere, `--headless` fails closed. |
| `app/` | `@proagents/ui` | Control-room server + single-page UI (PROAGENTS-WORKSPACE-UI.md MVP). Boots the real kernel via the SDK with the bundled plugin catalog; a projection over kernel events/session logs (spec §145) — no enforcement logic of its own. |

## Invariants (kernel purity, spec section 139)

- The kernel knows only the contracts in `packages/contracts`. GitHub, Docker,
  ACC, Codex, Repo Shield concerns live in `plugins/` — never in `packages/kernel`.
- Capabilities are obtained exclusively via `services.get(definition)`;
  direct instantiation of providers is forbidden.
- Before-execution events (`command/before`, `filesystem/before-write`) are
  awaited by the kernel, so protection subscribers veto **before** execution.
- Permissions: manifest requests ∩ configuration grants. A plugin can refine
  its scoped request during activation (`refinePlugin`) but can never exceed
  what `workspace.yaml` allows.
- Bundled plugin sets are catalogs: they activate only when the configuration
  references them (`catalog: true` in `WorkspaceClientOptions`).

## Standards

- TypeScript ESM, Node 18+, strict with `noUncheckedIndexedAccess`.
- Zod validation at every boundary (config, manifests).
- Error codes are a stability contract: never reuse or retype one.
- Every capability plugin ships a contract test suite; run
  `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before reporting.

## Commands

```bash
pnpm build          # build all packages in dependency order
pnpm test           # vitest across packages, plugins and integration tests
pnpm --filter @proagents/cli build && node packages/cli/dist/index.js doctor --json
```
