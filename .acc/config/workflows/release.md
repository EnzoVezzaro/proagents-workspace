# release.md — Documentation Release Checklist

Stable-contract checklist before publishing a ProAgents Workspace documentation release. The blocking rules below are load-bearing for agents, contributors, and future implementation work that will be written against these documents.

## Spec consistency (blocking)

- [ ] No document in `docs/` contradicts `README.md` (the canonical spec) or `DISTRIBUTION.md`.
- [ ] Spec section numbers cited in `docs/` match the current `README.md` numbering (no renumbered sections).
- [ ] The ecosystem boundary wording is consistent everywhere: ProAgents = WHO, ACC = WHAT, Workspace = WHERE.

## CLI vocabulary (blocking)

- [ ] Every command example uses the `paw` binary — no `proagent-workspace` binary references.
- [ ] Install instructions say `npm install -g proagents-workspace`.
- [ ] SDK imports use `@proagents/workspace`.
- [ ] Every documented command exists in the spec's CLI sections (50–63) and in `docs/cli-reference.md`.

## Links & index (blocking)

- [ ] Every Markdown link in `docs/` resolves to an existing document or anchor.
- [ ] Every document in `docs/` is reachable from `docs/index.md`.
- [ ] `docs/index.md` descriptions match the current document contents.

## Security honesty (blocking)

- [ ] Local runtime documentation states the honest security model (host-level isolation, unrestricted network by default) — never presented as a sandbox.
- [ ] No example places long-lived credentials inside a Workspace image.
- [ ] No example blindly executes install scripts.
- [ ] Protection is documented as intervening **before** execution, not logging after.

## Architecture honesty (blocking)

- [ ] No document places provider-specific behavior in the kernel (spec section 139).
- [ ] Capability examples use the service registry, not direct instantiation.
- [ ] Capability contract names are unchanged and versioned.

## Validation (blocking)

- [ ] `acc check` passes with 0 errors on the repository.
- [ ] `acc graph docs` shows the expected docs boundary with no new diagnostics.
- [ ] All `AGENTS.md` contracts match the current repository state (no ACC010/ACC072 diagnostics).

## Memory & contracts

- [ ] `.acc-memory.md` entries are current; durable lessons from the release are recorded (`acc memory add . "<lesson>"`).
- [ ] `.acc/config/` workflows and standards reflect the current documentation process.
- [ ] Any new agent profile, workflow, or standard is referenced from the relevant `AGENTS.md` Workflows section.

## Interruption rule

If stopped or corrected during release preparation, record the reason in `.acc-memory.md` under "Interrupts & Corrections" immediately.
