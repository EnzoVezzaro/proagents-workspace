# nodejs

The Node.js/pnpm toolchain for ProAgents Workspace — the technology direction is TypeScript, Node 18+ (target 22), pnpm, Vitest, Zod (spec section 118, `.acc/config/standards/typescript.md`).

## Purpose

The verification commands every code change must pass (`.acc/config/workflows/code-change.md`) — the same commands the product's own verification layer runs (`docs/verification.md`).

## Prerequisites

- Node.js 18+ (target 22)
- pnpm 9+

## Commands

```bash
pnpm install              # workspace bootstrap
pnpm lint                  # ESLint — blocking
pnpm typecheck             # tsc --noEmit — blocking
pnpm test                   # Vitest suite — blocking
pnpm build                  # blocking
pnpm -F @proagents/cli build   # single package build
```

All four verification commands must pass before any code commit:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Package targets

- `@proagents/workspace` — the SDK
- `proagents-workspace` — the `paw` CLI package
- `@proagents/core` — the kernel (when implementation lands, spec section 117)
- `@proagents/plugin-*` — provider plugins

## Safety rules

- CLI and SDK call the same services — no duplicated implementation (spec section 64)
- External configuration validated with Zod at the boundary (spec section 119)
- Errors carry stable codes and suggestions (spec section 99); logs never contain secrets (spec section 100)
- The first-five-minutes flow must never break (spec section 122)

## Consumers

- `.acc/config/agents/nodejs-engineer.md`
- `.acc/config/agents/verification-engineer.md`
- `.acc/config/workflows/code-change.md` (step 7, verify)
- `.acc/config/workflows/testing.md`
- `paw verify` (the product running these exact commands inside a workspace)
