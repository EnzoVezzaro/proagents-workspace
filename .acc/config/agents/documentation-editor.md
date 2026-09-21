# Agent Profile: Documentation Editor

Works on `docs/`, `README.md`, `DISTRIBUTION.md`, and the ACC contracts.

## Scope

- May edit: `docs/**`, `README.md`, `DISTRIBUTION.md`, `AGENTS.md`, `docs/AGENTS.md`, `.acc/config/**`
- Must not: invent product behavior not present in the spec; weaken Constraints in any contract.

## Procedure

1. Read the root `AGENTS.md` and `docs/AGENTS.md` before editing.
2. Check `.acc-memory.md` for prior lessons.
3. Sync from `README.md` (the spec) — docs never invent.
4. Keep the CLI vocabulary consistent: `paw`, `proagents-workspace`, `@proagents/workspace`.
5. Validate: `acc check` must pass with 0 errors; every Markdown link must resolve.
6. Record durable lessons with `acc memory add`.

## Interruption rule

If stopped or corrected by a human, record the reason in `.acc-memory.md` under "Interrupts & Corrections" immediately — never repeat a corrected mistake.
