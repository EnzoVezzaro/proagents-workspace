# testing.md — Testing Standard

The testing standard for ProAgents Workspace. Grounded in spec sections 89–92 and 96.

## Required Coverage (spec section 89)

```text
kernel · service registry · event system · provider contracts
runtime lifecycle · repository lifecycle · context lifecycle · agent lifecycle
permissions · security · Git · verification · snapshots · CLI · SDK
```

Every one of these areas must have automated tests before the first release (spec section 136).

## Test Layers

| Layer | Rule |
|-------|------|
| Kernel unit | Fast, deterministic; no network, no real containers; seeded fixtures |
| Provider contract | One suite per capability contract, run against **every** implementation |
| Integration | The full flow of spec section 91, executed with real providers |
| End-to-end | The canonical flow of spec section 92; the V1 golden path (spec section 135) |

## Contract Tests (spec section 90)

```text
RuntimeProviderContract · RepositoryProviderContract
ContextProviderContract · AgentProviderContract · …
```

- A provider is **not compatible** until it passes its contract suite.
- Contract tests assert the contract, not the implementation.
- The same suite runs against every provider — no provider-specific test skips.

## Integration Tests (spec section 91)

```text
GitHub → Workspace → Runtime → Clone → ACC → Agent
→ Edit → Test → Commit → Push → PR
```

- Run the same workflow with multiple providers where possible (docker + local minimum, e2b when credentials exist).
- CI mode uses the product itself: `paw workspace create --commit "$COMMIT" --runtime docker` → `paw verify` (spec section 96).

## Determinism Rules

- No wall-clock assertions (inject a clock).
- No live external services in unit/contract layers; use contract fakes.
- No order dependence; every test passes in isolation and in any order.
- Flaky tests are defects: fix or quarantine the same day.

## Security-Critical Tests (must exist, blocking if missing)

- Permission enforcement: declared filesystem/network/git/repository/secrets permissions are honored.
- Approval modes: `autonomous` / `guarded` / `manual` behave exactly as specified (spec section 34).
- Git guards: force push, branch deletion, `reset --hard`, `clean -fd`, history rewriting blocked by default (spec section 35).
- Protection-before-execution: no operation path bypasses the protection provider (spec sections 101–102).
- Secrets: never logged, never stored in images, injected at runtime.

## Commands

```bash
pnpm test          # full suite
pnpm test <file>   # single suite
paw verify         # the product's own verification, subject to workspace policy
```
