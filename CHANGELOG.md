# Changelog

All notable changes to ProAgents Workspace are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The repository is specification-first: until the first implementation release,
the project stays on 0.x and everything may change.

## [Unreleased]

### Added

- **Convention-first local mode (spec section 148) — the product's default experience is now a lightweight developer CLI around an existing repository.** `paw init` makes the current repository Workspace-aware by creating ONLY `.paw/` metadata (minimal `workspace.yaml` — `version: 1` alone is valid — plus `sessions/`, `artifacts/`, and a non-clobbering `AGENTS.md`); it never touches source files, package.json, or Git state. `paw status` answers where am I / what project / what branch / what agents / what verification, with honest degradation (no git, no agents, no config are reported facts, never failures). `paw verify` infers checks from existing project conventions (package scripts: lint → typecheck → test → build) before asking for configuration; configured commands win. `paw agent list` reports detected agents with honest integration tiers; discovery is capability-based over declared probes (binaries + well-known config files), not hard-coded conditionals. Configuration precedence implemented: built-in defaults → global user config → project config → environment → CLI flags; simple commands boot no plugins (lazy activation, spec sections 37–38). New SDK convention layer (`detectProject`, `discoverEnvironment`, `inferVerification`, `initWorkspace`, `workspaceStatus`, `loadConfig`) with a dependency-free minimal YAML parser that fails honestly on unsupported syntax. `runtime` is now OPTIONAL in the workspace config schema (the host machine is the default runtime); `git` is not in the zero-config default tool set. `paw desktop` reports honestly that the UI is optional. New error code `PROJECT_NOT_INITIALIZED`. New commands: `init`, `status`, `research`, `doctor`, `verify`, `diff`, `agent list`, `config show`, `desktop`, bare `paw`.
- **Workspace research (spec section 149) — the integration point with the ACC/ProAgents ecosystems.** `paw research` consults context providers through the existing `ContextProvider` contract (ACC when installed, resolved generically — never imported by the SDK, honoring the dependency direction), gathers repository/environment facts with provenance, derives ONLY the product questions the environment cannot answer (goal/audience/definition-of-done; agent-level questions belong to ProAgents), and writes `.paw/research/research.json` + `product.md` + `decisions.md`. The interview loop is resumable (`paw research answer <id> <answer>`, `paw research status`). Agent-level requirements are handed to ProAgents via `.paw/proagents/requirements.json` — PAW never generates skills/rules/profiles itself; ACC-owned files (`AGENTS.md`, `.acc/`) are consulted, not duplicated. Without a context provider, research degrades honestly ("standard repository context").

### Changed

- README rewritten around the convention-first developer experience (install → `paw init` → use your existing agent → verify), with progressive layers introduced after the golden path; spec sections 50–55 updated to the implemented command surface with the ergonomic rule (`paw verify`, not `paw workspace verify`); spec section 148 fixes terminology — **Workspace** = the developer/project environment by default, **isolated/runtime workspace** = the heavier sandboxed mode.

### Changed

- **Chat-workspace isolation (breaking behavior fix, spec §36 honored, README §147)**: every chat now creates its own NEW, EMPTY workspace under `chats/<chat-id>/` (unique suffix per chat) and the selected project is MATERIALIZED INTO it — never bound in place, never shared between chats. Local git repos materialize as a LINKED GIT WORKTREE with a per-chat branch (T3-Code-inspired: instant, space-efficient, one object store; slashes sanitized from branch names); non-git folders are copied per chat (`tar` pipe excluding `node_modules/`, `dist/`, `coverage/`, `.git/`, `.paw/`, `.acc/` — chats inherit code, not state); GitHub repos clone per chat into the chat's own directory (the shared `<base>/repos/<id>` pre-clone target is removed). The wizard's step 1 becomes "Workspace: Empty (default) | Local folder | GitHub repo" — an empty-workspace chat needs no project at all. The project registry is now a declarative source catalog: it creates no directories, binds no roots, and refuses chat workspaces as sources. Default hire root moved from `agents/<id>` to `chats/<id>`; the primary crew member's agentId equals the chat workspace id (1:1). Isolation verified LIVE end-to-end (`scripts/live-verify-isolation.sh`, 20 checks): empty/worktree/clone chats on distinct dirs, no cross-chat leakage, source repo untouched by worktree chats, per-chat branches, worktree metadata cleanup.

### Added

- **Chat retirement — settle & purge (T3-Code storage-cleanup model, README §147)**: `POST /api/chats/:id/settle` parks finished work without destroying anything (status `settled`, workspace + history + worktree stay on disk, resumable); `POST /api/chats/:id/purge` deletes the chat's workspace for good — GUARDED: uncommitted tracked changes or non-ignored untracked files refuse the purge (structured error, nothing deleted), explicit `force: true` destroys and honestly reports the destroyed work; purging a linked worktree runs `git worktree remove` against the source repo (no stale metadata); purge containment is absolute (only `<base>/chats/<id>` dirs are eligible). UI: ✓ Settle / 🗑 Purge chat actions with a settled badge + dimmed list entry and a confirm-then-force flow for dirty chats. 8 new tests (guard, force reporting, worktree detach, containment) — 278 green.

### Added

- Lifecycle definitions and harness adapters as plugins (completing spec §146 for the current surface):
  - `lifecycle` capability (16th entry in the §9 registry): `LifecycleProvider` contributes named lifecycle definitions as pure DATA via the SDK's new `definitions()` hook — a plugin cannot inject behavior, only reusable workflows. Two bundled definition plugins: `@proagents/plugin-lifecycle-web` (web-development: understand → plan → implement → unit/browser tests → review → ship) and `@proagents/plugin-lifecycle-security` (security-audit: understand → static review → threat model → verify findings → report). The control-room lifecycle library merges plugin contributions + `PAW_LIFECYCLE_JSON` + the built-in default (config wins on collision), `GET /api/lifecycles` exposes it with honest `source` labels (plugin|config|built-in), and the wizard gains a lifecycle picker bound to the chat's workspace entry.
  - Harness adapter plugins declare the same `runtime` descriptor as agent plugins (`agent-codex` now carries `capability: harness` + descriptor); the launchable-kind catalog dedupes agent and harness plugins into one row per kind with adapter lists — one catalog, two plugin families.
  - 9 new tests (contribution validation, config-schema conformance of plugin definitions, kind dedupe, descriptor completeness) — 261 green.

- Plugin-first architecture pinned as normative spec **section 146** (DeepSeek-Harness-inspired): everything that can be replaced, extended, configured, or composed is a plugin; the core provides runtime, contracts, lifecycle orchestration, events, permissions, and workspace isolation only. Additive contract support: plugin manifests may declare a `runtime` descriptor (`kind: process|service|external`, `command`, `label` — spec section 59) describing how the capability materializes outside the kernel. The agent CLI plugins and the DSH plugin declare their launch commands via the descriptor; the control room now derives the launchable agent-kind catalog (`GET /api/agents/kinds`) and harness launch commands from the plugin catalog's descriptors instead of hard-coded agent-kind→binary tables — a newly added agent plugin becomes launchable with zero product-layer code change. Consumers resolve declarations generically; the lifecycle engine never branches on provider names; default lifecycles/plugin sets are configuration data, never compiled-in behavior. Docs synced (`docs/architecture.md`), AGENTS.md constraint added.

- Configurable development lifecycle per chat/workspace (spec sections 6/16):
  `lifecycle.definitions` + `lifecycle.default` in workspace.yaml and
  `lifecycle: { ref | inline }` per workspace entry, validated by Zod in
  `@proagents/contracts` (`DevelopmentLifecycle`, `LifecycleStage` — stage
  type understand|plan|implement|test|review|ship|custom, per-stage agent
  profile bindings, tool bindings, execution policy: required/onFailure
  stop|retry|continue/maxRetries/timeoutMs/parallel). Kernel `LifecycleRunner`
  executes the resolved lifecycle with declarative failure semantics (only
  required stage failures fail the run; optional failures recorded honestly),
  emitting typed `lifecycle/stage-started|stage-completed|completed` events —
  stage EXECUTION is delegated to an injected `StageExecutor` (kernel purity,
  §139); `parallel` is advisory in this milestone and reported as such. The
  control room wires a default six-stage lifecycle (Understand → Plan →
  Implement → Test → Review → Ship) into every new chat, runs it through the
  crew's REAL terminal, and renders a Lifecycle Inspector rail as a pure
  projection over the `lifecycle/*` events, plus `POST
  /api/workspaces/:id/run-lifecycle` to trigger a run. 11 new tests — 252
  green.

- Wizard launch is now a fully SEQUENCED provisioning pipeline (the launch
  contract: configure → terminal → clone/folder-bind → install packages →
  ACC + proagents scaffold → harness): every setup step runs as a real
  command in the workspace's REAL terminal and is awaited on its true exit
  code via the new `runCommandAwait` PTY primitive (split-sentinel marker —
  echo-race safe, history-safe, real exit codes; `rc=$?` captured before
  assignments could reset it). The harness launches only into a FULLY
  provisioned workspace; a failed step keeps the raw shell, reports the
  failed step + exit code honestly (`provisioning.ok=false`), and recovery
  is one click: `POST /api/agents/:id/launch` + a `▶ Launch harness` button
  in the chat header. `ensureGitAskpass` moves GitHub authentication out of
  the typed command entirely (a 0700 helper reading the token from the env
  at call time — no more token-in-URL echoed into scrollback/history),
  `GIT_TERMINAL_PROMPT=0` fails fast instead of hanging the PTY, and
  `assertCloneTarget` now rejects credential-embedding URLs. The ACC +
  proagents scaffold no longer clobbers an existing AGENTS.md or context
  file on connected folders. 14 new tests (real-shell PTY await/exit-code/
  sequencing/echo-race, askpass secrecy, scaffold end-state) — 241 green.

- Agent hiring + project connection in the control room (the MVP's operational core):
  - `@proagents/plugin-agent-cli` — CLI agent adapters for `claude`, `codex`, `opencode`, `gemini` (Tier-2 process adapters): honest availability probing on PATH, `AGENT_PROVIDER_UNAVAILABLE` when missing, the CLI's stderr surfaced verbatim on a failed run, and per-workspace activation (an agent can only reach the adapter declared for its own scope).
  - Hire flow (`POST /api/agents/hire`): declaring a named workspace entry in the effective config (reconstructable-from-config preserved), mounting it through the kernel `WorkspaceManager` (own root, sandbox mode, plugin scope, session log), resolving the agent provider **from the mounted scope**, and starting the session with a hireable profile prompt distilled from `.acc/config/agents/`. Prompts prepend the profile prompt (who the agent is) to the task (what it does now); transcripts, status, and the kernel session log record every exchange. Stop ends the session and unmounts the scope; a failed hire is fail-closed (mount + entry reversed). N agents run concurrently in isolated workspaces.
  - Project connection (`POST /api/projects/local`, `POST /api/projects/github`): local folders must live inside the UI base dir (validated); GitHub repos clone through the kernel's guarded git plugin into `<base>/repos/<name>` (owner/repo shorthand or https URL; an optional token from `PAW_GITHUB_TOKEN`/`GITHUB_TOKEN` is used inside the git URL only — scrubbed from every error path, never logged).
  - Agents can be hired into a connected project by passing its root — the isolated workspace IS the project checkout.
  - Kernel fix found by the hire flow: plugins activating into a workspace scope now receive their manifest permission grants (merge semantics via `refinePlugin`, so parent-boot refinements are preserved).
  - 16 new unit tests (roster lifecycle, fail-closed teardown, project registry) — 206 tests green.
- Control-room web UI (`app/`, `@proagents/ui`) — the first runnable slice of `PROAGENTS-WORKSPACE-UI.md`'s MVP: boots a real kernel via `WorkspaceClient` with the bundled plugin catalog, serves a zero-build single-page control room (`paw-ui` / `pnpm ui`), and exposes the kernel as a projection — SSE event feed over the typed bus, named-workspace mount/unmount (§141), session-log tails (§143), guarded shell + filesystem writes through the kernel providers. Enforcement stays in the kernel: repo-shield/shell vetoes surface as structured `APPROVAL_REQUIRED` before execution (§101–102). Integration-tested end to end.
- Spec section 145 + `PROAGENTS-WORKSPACE-UI.md`: the desktop UI & product architecture supplement (structured like `DISTRIBUTION.md`), specifying the UI layer above the kernel — one workspace, many concurrent agent runtimes across heterogeneous harnesses; terminals as first-class owned objects; event-sourced sessions with trajectory/global-trajectory projections; cross-harness handoff and fork; capability-driven agent tabs; command palette, registry, and MVP/phased delivery. README §145 pins the binding boundary: the UI is a projection over kernel events/session log, adapts to `HarnessProvider` capabilities, and reports enforcement tiers honestly. Indexed from `docs/index.md` and cross-linked from `docs/workspace-implementation.md`.
- Spec sections 141–144: multi-workspace isolation (named workspaces, scoped service resolution, mount/unmount lifecycle, configuration-reconstructability), sandbox policy (modes, same-world confinement honesty, fail-closed semantics), the per-workspace append-only session log, and harness adapters (`HarnessProvider`, integration tiers `native`/`process`, normalized `session/*`/`model/*`/`compaction/*` lifecycle events). Docs synced (`configuration.md`, `workspace-implementation.md`).
- Typed harness adapter contracts in `@proagents/contracts`: `HarnessProvider` with honest integration tier (`native` | `process` — a process adapter can never claim native), `HarnessEnforcement` reporting whether a decision was actually applied and whether enforcement is blocking or advisory, and the normalized harness-side events in the typed event map.
- Multi-workspace isolation, sandbox policy, and session log implementation (DeepSeek Harness-inspired; spec sections 141–143):
  - `@proagents/kernel` gains `ScopedServiceRegistry`/`ShadowingServiceRegistry` (one capability instantiated independently per workspace — the Cordis `ctx.isolate()` counterpart), `WorkspaceManager` (mounts N named workspaces concurrently from a new `workspaces:` map in workspace.yaml; each scope gets its own registry view, sandbox mode, session log, and plugin activation; unmount disposes exactly its scope), and `SessionLog` (per-workspace append-only JSONL under `.paw/sessions/<workspace>/session.jsonl`, redacted at write time, bounded `tail()`).
  - New events `workspace/mounted` / `workspace/unmounted`; new error codes `WORKSPACE_ALREADY_MOUNTED`, `SANDBOX_UNAVAILABLE`, `SANDBOX_POLICY_VIOLATION` (fail-closed semantics).
  - Sandbox policy modes `read-only` / `workspace-write` (default, back-compat) / `danger-full-access` (spec section 142): `filesystem` vetoes writes before execution under `read-only` (`SANDBOX_POLICY_VIOLATION`); `shell` fails CLOSED with `SANDBOX_UNAVAILABLE` under `read-only` because a host-process shell cannot enforce read-only confinement — honestly reported, never silently downgraded.
- TypeScript implementation of the Workspace as a plugin system (pnpm monorepo):
  - `@proagents/contracts` — the 16 capability contracts (spec section 9), stable error codes (§99), typed event map (§7), Zod schemas for `workspace.yaml` and plugin manifests (§59, §119).
  - `@proagents/kernel` — event bus, service/capability registries, plugin discovery with dependency resolution and cycle detection, lifecycle state machine, declarative permission framework with approval modes (§34), health aggregation (§62–63), secrets-redacting structured logger (§100).
  - `@proagents/workspace` (SDK) — `definePlugin` authoring surface + `WorkspaceClient`; the shared implementation surface for CLI and integrations (§64).
  - `proagents-workspace` CLI (binary `paw`) — `doctor`, `plugin list`, `service list`, `config show`, `verify`; `--json` everywhere, `--headless` fails closed (§97).
  - Eight capability plugins: `filesystem` (sandboxed, before-write veto), `shell` (before-execution veto + approval), `git` (conservative guards per §35), `runtime-local` (zero-cloud default, honestly not a sandbox), `runtime-docker` (isolated, honest degradation), `context-acc` (indexes `.acc/` packs), `agent-codex` (availability detection), `repo-shield` (protection layer vetoing destructive operations before execution, §101–102).
- Integration test walking the spec §91 lifecycle flow (runtime → clone → context → edit → test → commit → guarded push) against the real plugins.
- E2E smoke tests for the `paw` CLI binary.
- `packages/AGENTS.md` and `plugins/AGENTS.md` functionality-local contracts.
- Rebuilt ProAgents interview from a fresh `proagent init` session (6415865f):
  the original auto-derived intent produced only 3 shallow questions; the new
  session walked the full topic questionnaire (write access, validation,
  runtime, input/output contract) and reached READY at 80% confidence with
  19 facts and zero contradictions.
- Generated the agent architecture spec (`proagent spec`): decision
  agent-team with 6 members mirroring `.acc/config/agents/`
  (technical-writer coordinator, backend-engineer, qa-engineer,
  security-engineer, devops-engineer, release-engineer), materialized as the
  registry-standard crew `.agents/crews/agent-team/` plus
  `agent-architecture.json`.
- Freebuff is the primary harness: `proagents.yaml` compatibility now lists
  freebuff first, `proagent setup --harness freebuff` compiled the composed
  professional skill, the AGENTS.md profile block, and `.mcp.json` for the
  Freebuff adapter (AGENTS.md + shared `.agents/skills` + MCP; policy is
  advisory in skill text — Freebuff has no native rule-enforcement surface,
  reported honestly by setup).

### Changed

- Root `package.json` is now the monorepo meta-package; workspace members live under `packages/` and `plugins/`.
- Permission grants are established before plugin activation, and plugins may refine scoped requests during activation (`PermissionFramework.refinePlugin`); grants remain intersected with configuration, so plugins can never self-grant (§59).
- `WorkspaceClient` accepts a `catalog` option: bundled plugin sets activate only when the workspace configuration references them.
- `paw doctor` aggregates provider-level health from registered capability services (service id included per entry).
- Crew brought to the registry crew folder standard (per
  proagents.reposell.dev/guide/registry and /guide/profiles): members bind
  registry profiles (`profile` field — expertise, methods, rules, and
  verification hydrate from the profile, never from the crew), every member
  carries an explicit permission model (production `write` only on operators,
  `secrets: named` only on release-engineer, approval gates on every
  production/publish action), context framework is `acc`, and section files
  (mission, members, coordination, tasks, workflows, handoffs, rules,
  verification) are clean named artifacts. Crew validates clean against the
  PA043–PA048 subagent standards; all 25 registry profiles pass
  `proagent validate --profiles` (PA030–PA038). Installed via
  `proagent crew build` to `.agents/crews/agent-team/` (workers/ layout,
  profile-hydrated SKILL.md + agent.json permission contract per worker);
  the earlier flat `.agents/skills/<profession>/` directories built from the
  raw session are removed as superseded.
- Environment-builder CLI upgraded to proagent v0.14.0 (from v0.13.0): the
  full validation gate re-ran green on the new version (architecture valid,
  spec+lock no findings, 25/25 profiles valid, crew PA043–PA048 clean, acc
  check clean). Upstream has not yet fixed the buildGraph self-edge/orphan
  defects or the interview id-collision, so the local graph patch was
  re-applied to the installed CLI (verified required by regenerating the
  spec unpatched: same PA004 + 2×PA007 findings). The reference in
  `docs/agent-environment.md` was bumped accordingly.
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
