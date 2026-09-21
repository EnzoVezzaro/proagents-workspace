# Changelog

All notable changes to ProAgents Workspace are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The repository is specification-first: until the first implementation release,
the project stays on 0.x and everything may change.

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
