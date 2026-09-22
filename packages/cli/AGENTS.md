# AGENTS.md — packages/cli/ (the `paw` CLI)

Functionality-local contract for the `paw` CLI package (`proagents-workspace`,
binary `paw`). Read `packages/AGENTS.md` and the root `AGENTS.md` first.

## Purpose

A thin CLI over the SDK: `doctor`, `plugin list`, `service list`,
`config show`, `verify`. `--json` everywhere, `--headless` fails closed.

## Ownership

Owner: proagents-workspace maintainers

## Dependencies

- plugins/ (the bundled V1 plugin catalog the CLI ships; each plugin activates
  only when the workspace configuration references it — a catalog, never an
  eager boot)
- docs/ (the CLI vocabulary and output shapes must stay consistent with the
  documentation set)

## Constraints

- Must not contain behavior: all platform behavior lives in the kernel and
  plugins; the CLI and SDK call the same services (spec section 64).
- Must read resolution and approval input from the kernel's permission
  framework, not re-implement it.
- Catastrophic-safe defaults follow the constraints in `packages/AGENTS.md`.

## Commands

```bash
pnpm --filter @proagents/cli build
node packages/cli/dist/index.js doctor --json
```