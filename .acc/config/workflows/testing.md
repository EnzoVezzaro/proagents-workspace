# Workflow: Testing

The workflow for writing or changing tests in ProAgents Workspace.

## When to use

- Adding unit, contract, integration, or end-to-end tests
- Making a provider pass its contract suite
- Adding verification commands to the workspace configuration

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md`
   - Agent profile: `.acc/config/agents/verification-engineer.md`
   - Standard: `.acc/config/standards/testing.md`
   - `.acc-memory.md` for prior lessons

2. **Classify the test.**

   | Layer | What it covers | Spec section |
   |-------|----------------|--------------|
   | Kernel unit | lifecycle, service registry, event system, permissions, Git safety | 89 |
   | Provider contract | one suite per capability, run against every implementation | 90 |
   | Integration | GitHub → workspace → runtime → clone → ACC → agent → edit → test → commit → push → PR | 91 |
   | End-to-end | the canonical flow, V1 golden path | 92, 135 |

3. **Write the test.**
   - Vitest; deterministic — no wall-clock, no live network where avoidable, seeded fixtures.
   - Contract tests assert the contract, not the implementation: same suite, every provider.
   - Security-critical paths must be covered: permissions, approval policies, Git guards, secrets handling (spec sections 33–35).

4. **Wire the lifecycle.**
   - Verification steps compose into the programmable lifecycle (`docs/lifecycle.md`) — new steps are registered in the step registry, not hard-coded.
   - Verification commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) run inside the workspace runtime, subject to permissions and network policy (`docs/verification.md`).

5. **CI mode.**
   - The same environment agents use must be usable headless for automated verification (spec section 96):
     ```bash
     paw workspace create --repo "$REPOSITORY" --commit "$COMMIT" --runtime docker
     paw verify
     ```

6. **Validate.**
   ```bash
   pnpm test
   acc check
   ```

7. **Record durable knowledge.**
   ```bash
   acc memory add . "<lesson learned>"
   ```

## Guardrails

- A provider is not compatible until it passes its contract suite — no exceptions (spec section 90).
- Never mark the V1 golden path (spec section 135) as passing without running the full flow.
- Flaky tests are defects: fix or quarantine the same day they appear.
