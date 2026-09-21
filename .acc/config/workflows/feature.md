# Workflow: Documentation Change

The standard workflow for changing documentation or contracts in this repository.

## When to use

- Adding or editing documents in `docs/`
- Updating `README.md` (the canonical spec) or `DISTRIBUTION.md` — use `.acc/config/workflows/spec-change.md` instead
- Adding a brand-new document to `docs/` — use `.acc/config/workflows/new-document.md` instead
- Changing any `AGENTS.md` contract or `.acc/config/` file

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md`
   - Functionality-local contract: `docs/AGENTS.md` when editing `docs/`
   - Durable knowledge: `.acc-memory.md` (root and local)

2. **Identify the source of truth.**
   - Product behavior → `README.md` (spec sections are numbered; cite the section)
   - Protection/distribution architecture → `DISTRIBUTION.md`
   - Docs distill the spec — never contradict it.

3. **Make the change.**
   - Keep CLI examples consistent: binary `paw`, package `proagents-workspace`, SDK `@proagents/workspace`.
   - Keep every cross-link valid within `docs/`.
   - New documents must be reachable from `docs/index.md`.

4. **Validate.**
   ```bash
   acc check                    # contract integrity (must pass with 0 errors)
   acc graph docs --format mermaid   # confirm the docs boundary still holds
   ```
   - Run the link check (see `.acc/config/tools/link-check/`) — every Markdown link must resolve.
   - Run the index check (see `.acc/config/tools/docs-index/`) when documents were added or renamed.
   - If a new document was added, confirm `acc check` reports no `ACC072` (orphaned content) and the index lists it.

5. **Record durable knowledge.**
   ```bash
   acc memory add . "<lesson learned>"
   ```

6. **Commit.**
   - Default Git behavior is conservative (no force push, no history rewriting).
   - Suggested message: `docs: <what changed and why>`

## Guardrails

- `README.md` wins on conflict — if a doc and the spec disagree, fix the doc.
- Never let the kernel absorb provider-specific behavior in examples or contracts (spec section 139).
- Local runtime docs must always state the honest security model.
