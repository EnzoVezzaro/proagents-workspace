# docs/

## Purpose

The published documentation set for ProAgents Workspace — the distilled, navigable version of the canonical product specification in `README.md`.

## Responsibilities

- Document the complete product surface: architecture, configuration, providers, lifecycle, verification, security, protection, distribution, and the `paw` CLI reference.
- Never contradict `README.md` (the canonical spec, 140 numbered sections) or `DISTRIBUTION.md`.
- Keep every cross-link valid — every Markdown link must resolve to an existing document or anchor.
- Keep command examples consistent: the CLI binary is `paw`, the npm package is `proagents-workspace`, the SDK is `@proagents/workspace`.
- Keep all documents aligned with the design principles: agent-first, runtime-neutral, repository-neutral, context-neutral, agent-neutral, reproducible.

## Ownership

Owner: proagents-workspace maintainers

## Inputs

- `README.md` — the canonical product specification (single source of truth for all content).
- `DISTRIBUTION.md` — the protection & distribution architecture supplement (distilled into `protection.md` and `distribution.md`).

## Outputs

- The documentation index (`index.md`) and 14 concept/provider/reference documents.
- The `workspace.yaml` configuration reference (`configuration.md`).
- The `paw` CLI contract (`cli-reference.md`).

## Dependencies

- README.md       (the canonical spec — content authority)
- DISTRIBUTION.md (protection & distribution supplement)

## Constraints

- MUST NOT introduce content that contradicts the spec; when in doubt, sync from `README.md`.
- MUST NOT use a CLI name other than `paw` in command examples (package: `proagents-workspace`).
- MUST NOT present local execution as equivalent to a sandbox; the security model must be visible in `runtime-providers.md` and `security.md`.
- MUST NOT document provider-specific behavior as kernel behavior (kernel purity, spec section 139).
- MUST NOT break the index: every document in `docs/` must be reachable from `index.md`.
- Verification is a loop, not a final step — reflect the programmable lifecycle in `lifecycle.md` and `verification.md`.

## Architecture

Organized as a documentation set with a single entry point:

- `index.md` — the table of contents, grouped: Getting Started, Concepts, Providers, Safety & Trust, Distribution.
- Getting started: `getting-started.md`, `configuration.md`, `cli-reference.md`.
- Concepts: `product-model.md`, `architecture.md`, `lifecycle.md`.
- Providers: `runtime-providers.md`, `repository-providers.md`, `context-providers.md`, `agent-providers.md`.
- Safety & Trust: `security.md`, `protection.md`, `verification.md`.
- Distribution: `distribution.md`.

`context-providers.md` documents the official ACC integration (`acc` CLI, npm package `acc-code-context`): `AGENTS.md` contracts, `.acc/config/` control plane, `.acc-memory.md` knowledge, and provenance-tagged truth categories.

## Workflows

- See `.acc/config/workflows/feature.md` for the standard documentation change workflow.
- See `.acc/config/workflows/spec-change.md` for spec changes and the docs-sync mapping.
- See `.acc/config/workflows/new-document.md` for adding a new document to this set.
- See `.acc/config/workflows/release.md` for the documentation release checklist.

## Standards

- See `.acc/config/standards/documentation.md` for the documentation rules this set follows.
- See `.acc/config/standards/cli-vocabulary.md` for the fixed `paw` CLI vocabulary.
- See `.acc/config/standards/security.md` for the security model rules.
- See `.acc/config/standards/architecture.md` for the kernel purity rules.

## Agent operating instructions

When editing documentation:

1. Read the root contract (`AGENTS.md`) first; the Constraints there apply here.
2. Sync content from `README.md` — the docs distill the spec, never invent.
3. Verify every Markdown link resolves (relative links within `docs/` only).
4. Run `acc check` after changes; fix any `ACC010`/`ACC072` diagnostics.
5. Record durable lessons with `acc memory add docs/ "<lesson>"`.
