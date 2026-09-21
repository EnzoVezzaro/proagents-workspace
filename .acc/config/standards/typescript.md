# typescript.md — TypeScript & Node.js Standard

The implementation standard for all code in ProAgents Workspace. Grounded in the technology direction (spec section 118) and API design (spec section 119).

## Technology Stack (fixed)

```text
TypeScript · Node.js 18+ (target 22) · pnpm workspaces · Vitest · Zod
```

- TypeScript for: core, SDK, CLI, providers, contracts, configuration.
- Platform-specific/native components only where required: process isolation, PTY, filesystem operations, runtime integrations.
- pnpm is the only package manager for the monorepo.

## Repository Layout (spec section 117)

```text
packages/   contracts, kernel, CLI, SDK — no provider business logic
plugins/    concrete implementations (github, acc, e2b, docker, codex, ...)
examples/ · templates/ · docs/ · tests/ · scripts/
```

The exact layout may change during implementation; the separation rule may not.

## Typing Rules

- Strongly typed APIs everywhere; `any` requires a justification comment — and usually does not get one.
- External configuration is validated with Zod schemas at the boundary:
  ```text
  WorkspaceConfig · RuntimeConfig · RepositoryConfig · AgentConfig
  ContextConfig · PermissionConfig · NetworkConfig · VerificationConfig
  PluginManifest
  ```
- Capability requests go through the service registry (`services.get(definition)`), never direct instantiation.
- Capability contracts are versioned; implementations declare compatible API versions (spec section 120).

## CLI & SDK Rules

- CLI and SDK call the same services — no duplicated implementation (spec section 64).
- Every important command supports `--json` with deterministic output.
- Errors: stable codes, `message`, `provider`, `recoverable`, `suggestions` (spec section 99).
- Everything works headless (spec section 97).
- Structured logging: timestamp, workspaceId, sessionId, provider, operation, severity, duration, result. Secrets are never logged (spec section 100).

## Verification Commands

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass before any commit that touches code.

## Event & Contract Rules

- Cross-cutting behavior integrates via typed events — providers never import each other (spec section 7).
- New capability contracts extend the registry in spec section 9; they never fork existing contracts.
- Breaking contract changes require a version bump and a migration path (spec sections 120–121).
