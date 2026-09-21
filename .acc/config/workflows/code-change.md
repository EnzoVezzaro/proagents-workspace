# Workflow: Code Change

The workflow for implementing or changing TypeScript code (kernel, CLI, SDK, contracts, configuration) — the implementation counterpart to the documentation workflows.

## When to use

- Any change under `packages/` or `plugins/`
- Changes to capability contracts
- CLI or SDK behavior changes

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md` and the functionality-local `AGENTS.md` for the package you touch.
   - Standards: `.acc/config/standards/typescript.md`, `.acc/config/standards/architecture.md`
   - `.acc-memory.md` for prior lessons
   - The relevant spec sections — the code implements the spec, never invents

2. **Check where the change belongs.**
   - Contract + kernel logic → `packages/`
   - Concrete implementation → `plugins/`
   - If you find yourself writing "if provider === github" outside the GitHub plugin, stop (spec section 139).

3. **Design at the boundary.**
   - Strong typing; validate external input with Zod at the boundary (spec section 119).
   - Typed events for cross-cutting behavior — no direct provider-to-provider imports (spec section 7).
   - Capabilities through `services.get(<definition>)` — never `new` a provider class (spec sections 6–7).

4. **Implement.**
   - pnpm workspace commands; strict TypeScript.
   - Errors: stable codes, `recoverable`, actionable `suggestions` (spec section 99).
   - Logs: structured, secrets excluded (spec section 100).

5. **Test.**
   - Follow `.acc/config/workflows/testing.md`.
   - Kernel and contract coverage per the testing standard.

6. **Security gate.**
   - If the change touches permissions, secrets, network, Git, protection, or runtime isolation → run `.acc/config/workflows/security-review.md`.

7. **Verify (all must pass).**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   acc check
   ```

8. **Sync documentation.**
   - Behavior changes update `README.md` (via `.acc/config/workflows/spec-change.md`) and the matching `docs/` page in the same change.

9. **Record durable knowledge.**
   ```bash
   acc memory add . "<lesson learned>"
   ```

10. **Commit & PR.**
    - Conservative Git defaults: no force push, no history rewriting.
    - PR description from `.acc/config/templates/pull-request.md` — Summary, Changes, Verification.
    - Verification results are collected into the PR automatically by the product's own flow (spec section 39) — practice what the product preaches.

## Guardrails

- Breaking SDK/config changes require: detect old version → migrate → validate → report (spec section 121).
- The first-five-minutes experience (install → `paw workspace create`) must never break (spec section 122).
- Zero-cloud path must keep working without any cloud dependency (spec section 123).
