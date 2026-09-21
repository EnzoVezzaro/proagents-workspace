# vitest

The test runner for ProAgents Workspace — unit, provider-contract, and integration layers (spec sections 89–92, `.acc/config/standards/testing.md`).

## Purpose

Runs the full testing pyramid: kernel unit tests, provider contract suites (RuntimeProviderContract, RepositoryProviderContract, ContextProviderContract, AgentProviderContract), integration flows, and the end-to-end golden path.

## Prerequisites

- Node.js 18+, pnpm
- Contract fakes for the kernel/contract layers — no live network, no real containers

## Commands

```bash
pnpm test                          # full suite — blocking on every change
pnpm test test/kernel/service-registry.test.ts   # single suite
pnpm test --filter contracts       # all contract suites against a provider

# Contract suite against a specific provider (spec section 90):
RUNTIME_PROVIDER=docker pnpm test -F runtime-contract
RUNTIME_PROVIDER=local  pnpm test -F runtime-contract
```

## Coverage targets (spec section 89 — all blocking for release)

```text
kernel · service registry · event system · provider contracts
runtime lifecycle · repository lifecycle · context lifecycle · agent lifecycle
permissions · security · Git · verification · snapshots · CLI · SDK
```

## Determinism rules

- Injected clock — no wall-clock assertions
- Contract fakes — no live services in unit/contract layers
- No order dependence; any test passes in isolation
- A flaky test is a defect: fix or quarantine the same day

## Security-critical suites (must exist)

- Permission enforcement (filesystem/network/git/repository/secrets)
- Approval modes (autonomous/guarded/manual)
- Git guards (force push, branch deletion, reset --hard, clean -fd)
- Protection-before-execution (no bypass paths)
- Secrets never logged, never stored in images

## Consumers

- `.acc/config/agents/verification-engineer.md`
- `.acc/config/workflows/testing.md`
- `.acc/config/workflows/code-change.md` (step 7, verify)
- `.acc/config/workflows/new-provider.md` (step 5, contract suite)
- `.acc/config/workflows/release.md` (Definition of Done, spec section 136)
