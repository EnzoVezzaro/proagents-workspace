# Workflow: Spec Change

The workflow for changing `README.md` (the canonical product specification) or `DISTRIBUTION.md` (the protection & distribution supplement).

## When to use

- Editing any numbered section of `README.md`
- Editing `DISTRIBUTION.md`
- Adding a new spec section

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md`
   - `.acc-memory.md` for prior lessons
   - The section you are changing and every cross-reference to it

2. **Preserve the numbering.**
   - Section numbers are stable identifiers cited across `docs/` (e.g. "spec section 139").
   - Never renumber, repurpose, or delete an existing section.
   - New sections take the next available number (current maximum: 140).

3. **Make the change in the spec.**
   - Keep decided terminology: CLI `paw`, package `proagents-workspace`, SDK `@proagents/workspace`.
   - Preserve the critical architectural rule (section 139) and the design principles (section 4).

4. **Sync the documentation — same change, same commit.**
   - Identify every document in `docs/` that distills the changed section:
     - Product model → `docs/product-model.md`
     - Architecture, kernel, events, contracts → `docs/architecture.md`
     - Runtime → `docs/runtime-providers.md`
     - Repository, project detection → `docs/repository-providers.md`
     - Context, ACC → `docs/context-providers.md`
     - Agents → `docs/agent-providers.md`
     - Security, permissions, secrets → `docs/security.md`
     - Protection → `docs/protection.md`
     - Verification → `docs/verification.md`
     - Lifecycle → `docs/lifecycle.md`
     - Configuration, profiles → `docs/configuration.md`
     - CLI → `docs/cli-reference.md`
     - Getting started → `docs/getting-started.md`
     - Distribution → `docs/distribution.md`
   - `docs/` must never contradict the spec — if a doc and the spec disagree, fix the doc.

5. **Validate.**
   ```bash
   acc check        # 0 errors required
   # link check: every [text](target) in docs/*.md resolves
   ```

6. **Record durable knowledge.**
   ```bash
   acc memory add . "<lesson learned>"
   ```

7. **Commit.**
   - Suggested message: `spec: update section <N> — <what and why>`

## Guardrails

- The spec change and the docs sync land together — never leave `docs/` stale relative to the spec.
- New product behavior in the spec requires the matching `docs/` update in the same commit.
- If interrupted or corrected, record the reason in `.acc-memory.md` under "Interrupts & Corrections".
