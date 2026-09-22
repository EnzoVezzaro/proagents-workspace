# Changelog

All notable changes to ProAgents Workspace are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The repository is specification-first: until the first implementation release,
the project stays on 0.x and everything may change.

## [Unreleased]

### Added

- Rebuilt ProAgents interview from a fresh `proagent init` session (6415865f):
  the original auto-derived intent produced only 3 shallow questions; the new
  session walked the full topic questionnaire (write access, validation,
  runtime, input/output contract) and reached READY at 80% confidence with
  19 facts and zero contradictions.
- Generated the agent architecture spec (`proagent spec`): decision
  agent-team with 6 profile-bound members mirroring `.acc/config/agents/`
  (technical-writer coordinator, backend-engineer, qa-engineer,
  security-engineer, devops-engineer, release-engineer), compiled into 6
  per-agent skills under `.agents/skills/` plus `agent-architecture.json`.
- Freebuff is the primary harness: `proagents.yaml` compatibility now lists
  freebuff first, `proagent setup --harness freebuff` compiled the composed
  professional skill, the AGENTS.md profile block, and `.mcp.json` for the
  Freebuff adapter (AGENTS.md + shared `.agents/skills` + MCP; policy is
  advisory in skill text — Freebuff has no native rule-enforcement surface,
  reported honestly by setup).

### Fixed

- proagent v0.13.0 graph bugs (patched locally in the installed CLI, original
  preserved as `specification.js.bak-0.13.0`): PA004 self-edge when the
  coordinator is also the documenter, and PA007 orphaned agents when the
  catalog matches more than one member per role. `proagent validate` now
  reports 0 errors / 0 warnings for the generated architecture.
- proagent v0.13.0 interview id-collision: derived follow-up questions reuse
  ids of already-persisted seed questions and are silently dropped (the
  inputs-outputs probe was lost). Worked around by injecting the question into
  the session file and answering it through the normal CLI.
- Stale OpenCode artifacts removed: `opencode.json` (denied rules never
  applied on Freebuff) deleted; all skill text now names the freebuff harness.
  Force-push, branch-deletion, and history-rewrite guards remain declared in
  `proagents.yaml` policies and the AGENTS.md profile rules.
- Re-ran `proagent resolve` → `lock` → `validate --spec` after the harness
  change: 3 capabilities resolved, spec+lock validation ok.

### Changed

- Composed professional skill directory retains the release-checklist
  knowledge file (`knowledge/release-checklist.json`) after the Freebuff
  re-setup; setup's known limitation of not copying packaged-registry
  knowledge files did not recur, but the file is verified present.
- `docs/agent-environment.md` — new documentation page covering this repository's
  own ProAgents agent environment: `proagents.yaml`/`proagents.lock`, the
  compiled `.agents/skills/` artifacts (composed profile + six-member crew),
  the regeneration pipeline (`proagent resolve → lock → validate --spec →
  setup --harness freebuff` and the interview-based `init → spec → build`
  rebuild), and an honest statement of what is declared versus actually
  enforced. Wired into `docs/index.md` (Getting Started) and cross-linked from
  `docs/agent-providers.md`; fixed a broken `protection.md` anchor link in
  `docs/context-providers.md` found by the link check.

## [0.1.0] - 2026-09-21

The first tagged release: the complete product specification, the distilled
documentation set, and the ACC agent environment. No implementation code
yet — `packages/` and `plugins/` land in subsequent releases per the V1 scope
(spec section 134).

### Added

**Product specification**
- `README.md` — the canonical product spec: 140 numbered sections covering the
  product model, architecture, kernel, capability contracts, providers
  (runtime, repository, context, agent), tools & services, security, the
  programmable verification lifecycle, CLI, plugins, observability, modes,
  cloud path, open-source structure, and the Definition of Done.
- `DISTRIBUTION.md` — the protection & distribution architecture supplement
  (Repo Shield protection boundary, reposell distribution & licensing).

**Documentation set (`docs/`, 15 documents)**
- `index.md` — the documentation index (Getting Started / Concepts /
  Providers / Safety & Trust / Distribution).
- `getting-started.md`, `configuration.md`, `cli-reference.md` — install,
  workspace definition, profiles, reproducibility, and the full `paw` CLI
  surface with `--json`, structured errors, and workspace modes.
- `product-model.md`, `architecture.md`, `lifecycle.md` — ecosystem
  boundaries (ProAgents = WHO, ACC = WHAT, Workspace = WHERE), the kernel +
  service registry + events model, and the programmable development
  lifecycle.
- `runtime-providers.md`, `repository-providers.md`, `context-providers.md`,
  `agent-providers.md` — the provider layer: E2B/Docker/local runtimes,
  GitHub/GitLab/Git repositories, the official ACC integration
  (`acc` CLI, npm package `acc-code-context`) with command-to-contract
  mapping and truth provenance, and the agent providers (Codex, Claude,
  OpenCode, Gemini, ProAgents).
- `security.md`, `protection.md`, `verification.md` — declarative permissions,
  approval modes, secrets, explicit networking, the Repo Shield protection
  boundary (before execution, never after), and the verification loop with
  impact-aware verification.
- `distribution.md` — the reposell distribution layer: artifacts, licensing,
  access control, marketplace compatibility.

**ACC agent environment (`.acc/config/`, this repository is agent-native)**
- 12 agent profiles: spec-editor, documentation-editor, architecture-reviewer,
  security-reviewer, nodejs-engineer, runtime-engineer, kubernetes-engineer,
  cloud-infrastructure-engineer, plugin-engineer, verification-engineer,
  reliability-engineer, open-source-maintainer.
- 9 workflows: feature, spec-change, new-document, release, code-change,
  new-provider, new-plugin, testing, security-review.
- 10 standards: architecture (kernel purity, spec section 139), security,
  cli-vocabulary, documentation, typescript, testing, versioning, container,
  cloud-infrastructure, open-source.
- 6 templates: AGENTS.md contract, memory, provider-contract scaffold,
  plugin manifest (spec section 59), workspace profile (spec section 46),
  pull-request (spec section 39).
- 8 declared tools (listed by `acc tools`): link-check, docs-index, docker,
  opentofu, kubernetes, nodejs, vitest, playwright.
- `AGENTS.md` root contract + `docs/AGENTS.md` boundary contract; `.acc/config/`
  control plane validated by `acc check` with zero diagnostics.

**Repository**
- `.gitignore` — agent memory and ACC state excluded from version control.

### Fixed
- Documentation CLI naming inconsistency: all command examples now use the
  `paw` binary (package `proagents-workspace`, SDK `@proagents/workspace`)
  per the spec's CLI sections (50–63); previously 41 examples used the
  incorrect `proagent-workspace` binary name.
- Broken documentation index links: `verification.md` and `cli-reference.md`
  were referenced from `index.md` but did not exist.

[0.1.0]: https://github.com/EnzoVezzaro/proagents-workspace/releases/tag/v0.1.0
