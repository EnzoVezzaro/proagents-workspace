# Changelog

All notable changes to ProAgents Workspace are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The repository is specification-first: until the first implementation release,
the project stays on 0.x and everything may change.

## [0.5.3] - 2026-09-25

The bootstrap contract grows up: `paw init` is now the six-stage bootstrapper that installs every layer in dependency order, empty repositories get an honest questionnaire instead of a guess, and the target layout becomes directory-per-layer. Documentation and the npm landing page stay in sync with the new vocabulary.

### Changed

- **`paw init` is the workspace bootstrapper; `paw install` is an alias** (spec section 152) — `init` now runs the full six-stage bootstrap (resolve → acc → shield → proagents → reposell → paw) instead of the light `.paw/`-only init; `install` remains a stable alias with identical behavior. `--json` output reports `command: "init"` and `target` (detection) rather than the old init result shape.
- **Directory-per-layer install layout** — the staged bootstrap writes `.reposhield/policy.yaml` (was `.reposhield.yaml`), `.proagents/{profiles/, crew/, config.yaml}` (was `proagents.yaml` + crews under `.agents/crews/`), and `.reposell/distribution.yaml` (was `.reposell.yaml`). The per-profession profile files moved from `.acc/config/agents/` to `.proagents/profiles/` — ACC describes WHAT the repository knows, ProAgents owns WHO operates. The crew coordination channel is written to `.proagents/crew/COMMENTS.md`; the installer never writes into `.agents/` (agent-owned, spec section 146 hygiene). Existing files at the old paths are preserved, not migrated or deleted.

### Added

- **Five-question project questionnaire for empty repositories** (spec section 152, resolve stage) — when no code and no README can describe the project, `paw init` asks five questions (product, purpose, technologies, distribution, protection) inline on a TTY and applies the resulting intent immediately; headless runs get the exact `paw init --answers "product" "purpose" "technologies" "distribution" "protection"` invocation instead. Answers are pure functions into a `ProjectIntent` (`questionnaire.ts`, SDK-exported: `QUESTIONNAIRE`, `questionIds`, `questionsFor`, `answersToOutcome`) with provenance `questionnaire (n/5 answered)`; the protection answer seeds the Repo Shield mode and the distribution answer seeds the reposell mode. New stable error code `QUESTIONNAIRE_EMPTY` for an `--answers` call with no usable answers.

### Fixed

- **Stray installer output no longer pollutes the repository** — running `paw init` in this repo (e.g. from a smoke test) wrote `.proagents/`, `.reposhield/`, and `.reposell/` into the root as untracked files; they are now git-ignored like `.paw/` (this repo's own environment stays tracked at `proagents.yaml` / `proagents.lock`).

## [0.5.2] - 2026-09-25

The runbook now ships where agents actually read: the canonical spec, the npm landing page, and Getting Started all point to `docs/paw-install-runbook.md`, the complete install → set up → complete contract. Also hardens the release pipeline's registry verification so a successful publish is never reported as a failure. Documentation and release-metadata only: no code, contracts, or CLI behavior changed.

### Added

- **Runbook pointers on every install surface** — the canonical spec (`README.md`) is the first thing an agent reads, and the npm landing page (`packages/cli/npm-README.md`) is the first thing an agent reads after installing. Neither referenced the new `docs/paw-install-runbook.md`. Both now point to it as the complete **install → set up → complete** contract, and the runbook is linked in the npm page's Links section and in `docs/getting-started.md`. The spec reference is added inside the existing top-level quickstart and the init-process section (spec section 152) — no new numbered section, so the spec section count stays 153 (`PAW003`).

### Fixed

- **Release workflow registry verification** (`.github/workflows/release.yml`) — the 0.5.1 release run published successfully to npm but the post-publish "Verify the registry" step reported failure, because it polled 6×45s (~4.5 min) while npm Trusted Publishing took longer to propagate to the runner's read replica. The publish was confirmed healthy by a cold install; the poll is widened to 24×30s (12 min) so future releases are not falsely reported as failed.

## [0.5.1] - 2026-09-25

The agent-experience patch: the five-phase install contract (spec section 152) now ships with a complete runbook that tells an AI agent how to install, set up, and **complete** a ProAgents Workspace — and how to steer, self-review, and report the run honestly. Documentation only: no code, contracts, or CLI behavior changed.

### Added

- **PAW Installation Runbook** (`docs/paw-install-runbook.md`) — the agent-facing execution contract for a Workspace install, structured as the three verbs the install actually is: **install** (the five-phase contract inspect → understand → initialize → configure → verify; the `never` list — metadata-only, idempotent, never touches application code, manifests, or git state; exit codes `0`/`1`; `INTENT_SOURCE_UNREADABLE`), **set up** (verification configuration, lifecycle, agent tiers, and the optional progressive integrations: ACC-aware research, isolated runtimes, checkpoint plans, headless CI, and reproducibility via `workspace export` → `workspace create --from`), and **complete** (the install/status/doctor/check/verify/diff gates plus a runtime smoke test that is explicitly marked *unverified* when no harness is available). Folds in the operating discipline an agent needs to finish a long run unattended and be checked afterward: hand over the whole task with a finish line and explicit stop conditions, no "think carefully" filler, the keep-going-vs-stop-and-ask rule, subagent fan-out with per-result evidence checks, a durable task file that survives context compaction, an independent review pass before a human reviews, and marking what could not be confirmed. Product boundaries are stated up front — Workspace is **WHERE** (this runbook installs only `paw`; ProAgents = WHO and ACC = WHAT are separate installs). Grounded in `install/install.yaml` and cross-linked from `docs/bootstrap.md`, `docs/index.md`, and the rest of `docs/`.

### Changed

- All workspace packages bumped 0.5.0 → 0.5.1; `install/manifest.yaml` (spec section 152) carries the released version, keeping the `paw check` coherence gates (PAW001 manifest skew, PAW002 package disagreement, PAW008 changelog gap) satisfied. The `paw --version` repo-build fallback literal (`packages/cli/src/index.ts`) bumped 0.5.0 → 0.5.1 so the source build reports the released version (the published bundle injects the real version via esbuild `--define`).
- `docs/index.md` indexes the runbook; `docs/bootstrap.md` cross-links it as the complete install-and-complete contract.
- `docs/AGENTS.md` documentation contract: corrected the stale spec-section count (140 → 153, matching the canonical `README.md`), dropped the hardcoded document count that drifted with every new doc, and completed the getting-started document list (bootstrap, runbook, health-checks, workspace-implementation).

### Fixed

- **Release workflow coherence check** (`.github/workflows/release.yml`) — the version-coherence step matched the changelog heading and manifest version with `grep -q "## [$PKG_VERSION]"` and `grep -q "^version: $PKG_VERSION"`. In double quotes `[0.5.1]` is a bracket character class, not a literal, so the pattern never matched the real `## [0.5.1]` heading and the check failed for **every** version. The automated pipeline had never completed a run (v0.5.0 predates the workflow), so the bug stayed latent. Both checks now use `grep -qF` (fixed-string).

## [0.5.0] - 2026-09-24

The file-driven bootstrap release: `paw init README.md` / `paw install <file>` start the workspace from the project's own words — the `@README.md` semantic contract made literal. Includes the first public dogfood of the published installer against a real foreign repository (ProAgents itself), which verified every preservation guarantee byte-for-byte and surfaced two honesty fixes shipped here.

### Added

- **Self-diagnostics: `paw check` (spec section 153)** — the framework policing itself: the ACC-check analogue applied to the Workspace's own configuration artifacts. Stable `PAW0xx` diagnostic codes (a versioning contract, `packages/contracts/src/diagnostics.ts`) catch exactly the drift class that shipped in past releases: manifest/CLI version skew (PAW001), package version disagreement (PAW002), AGENTS.md spec-count drift (PAW003), template/generator divergence (PAW004), missing bootstrap contract files (PAW005), invalid `.paw/` config (PAW006), stale section citations (PAW007), changelog gaps (PAW008), cli-reference omissions (PAW009), unreadable lifecycle state (PAW010), and an honest `PAW011` when nothing is checkable. Product boundaries held: `paw check` reads NO ACC or ProAgents files (`.acc/`, `proagents.yaml`/`.lock`) — those systems diagnose themselves (`acc check`, `proagent validate --spec`); the framework marker is Workspace-owned (`install/manifest.yaml`). Every diagnostic carries code, severity, message, evidence, and a fix suggestion; exit 1 on error-severity findings; `--json` for agents; never mutates anything. Docs: `docs/health-checks.md`, README spec section 153; `paw check` added as a blocking release-checklist step. 10 new SDK tests with injected-defect fixtures.
- **File-driven init/install — the `@README.md` contract made literal (spec sections 148/152)** — both entrypoints now accept a source file: `paw init README.md` / `paw install BRIEF.md` start the workspace from the project's own words. The inferred intent (product type, domains, skills, provenance) is persisted into the generated `.paw/workspace.yaml` as the informational `project:` block (named sources, edit freely; manifest evidence always included in `derivedFrom`). New: `projectIntentSchema` + `project` in the workspace config schema, structured error `INTENT_SOURCE_UNREADABLE` (an unreadable source never silently degrades), pure `inferIntentFromText` shared by init/install (plural-aware dictionaries), `findReadmeText`, SDK `InitResult.intent` / `InstallPlan.from`; the generated `AGENTS.md` gains product-type/domains lines. Backward compatible: without a file, behavior is unchanged; existing configs are untouched.
- **Init process documented across the agent-facing surfaces** — root `AGENTS.md` operating instruction #10 + Workflows pointer, README §152 "The init process" (context→command table + 3-step agent process), `install/AGENT.md` leading with the file-driven init and the contract-folder map, `install/instructions.md` path table, and the npm README quickstart now leads with `paw init README.md` + the Setup-prompt UX.

### Changed

- Install-report honesty (dogfood findings): the report no longer hardcodes a phase count — it prints the exact effective flow length (canonical + stage-plugin contributions) via `paw lifecycle show`, and the SDK note defers to it.

## [0.4.0] - 2026-09-24

The agent-bootstrap release: the Workspace is now installable BY an AI agent, not merely FOR one — and every workspace runs a canonical lifecycle. One line pasted into any coding agent (`Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md`) bootstraps a target repository through the five-phase install contract; `paw lifecycle` exposes the kernel-owned phase spine that stage plugins extend declaratively. Ecosystem roles unchanged: ProAgents (WHO, github.com/EnzoVezzaro/proagents) and ACC (WHAT) are separate projects — the Workspace (WHERE) bootstraps without either.

### Added

- **Agent bootstrap installer (spec section 152)** — the Workspace is now installable BY an AI agent, not merely FOR one: `npx @reposell/proagents-workspace@latest install` (the new `paw install`) runs the five-phase contract — inspect → understand → initialize → configure → verify — against any repository. The understand phase infers project intent (product type, domains, skills) from `@README.md` + manifests with named provenance; the install is metadata-only (never touches application code, package.json, or git state), preserves existing `AGENTS.md`/`.paw/workspace.yaml`, is idempotent, and reports the verification plan without executing it (`paw install --verify` delegates to the real verify path). Contract files: `install/manifest.yaml` (machine-readable package metadata), `install/install.yaml` (the install contract as data — pinned by unit tests), `install/AGENT.md` (the bootstrap protocol external agents follow from the prompt "Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md"), `install/instructions.md`, and `templates/AGENTS.md`; SDK `installWorkspace`/`inferProjectIntent`; docs/bootstrap.md; README spec section 152. Ecosystem roles unchanged: ProAgents (WHO, github.com/EnzoVezzaro/proagents) and ACC (WHAT) are separate projects — the Workspace (WHERE) bootstraps without either.
- **The canonical workspace lifecycle (spec section 151)** — the kernel owns the canonical phases (create → research → initialize → plan → develop → verify → release → distribute → operate) and the orchestration; executors and plugins own the phase work. `paw lifecycle show | run | status` inspects and runs the effective flow: each stage binds a phase to an execution mode (`checkpoint-plan`, `command`, `research`, `manual`), runs fail-closed on required phases (a failure stops the flow), emits typed `lifecycle/*` events, and persists outcomes to `.paw/state/lifecycle-state.json`. Stage plugins contribute phases declaratively via a manifest `lifecycleStages` list (insert-after-anchor; unknown anchors are skipped, never reordered) — demonstrated by the new bundled `@proagents/plugin-stage-threat-modeling` (threat-modeling manual phase after research). New: `WorkspaceLifecycleRunner`, `composeFlow`, `defaultFlow`, `spliceContributions` in the kernel/SDK; `lifecycleFlow` in the workspace config schema; 4 lifecycle events in the contracts; 8 new kernel/CLI tests (268 total).

### Changed

- All workspace packages bumped 0.3.0 → 0.4.0. `install/manifest.yaml` (spec section 152) now carries the released version, and the repo-build fallback for `paw --version` (running from source without the npm bundle's `--define` injection) reports the release version instead of the stale 0.2.0.

## [0.3.0] - 2026-09-24

The desktop application is retired. ProAgents Workspace is a **clean workstation for AI coding agents**: `paw` prepares, verifies, and observes the workspace; the coding agent (Codex, Claude Code, OpenCode, Gemini CLI, DeepSeek Harness, Freebuff, …) works in that environment through its own interface — the terminal.

### Added

- **npm publish pipeline + first published package** (`@reposell/proagents-workspace@0.2.0`): the `paw` CLI is now installable worldwide via `npm install -g @reposell/proagents-workspace`. Mechanism: esbuild compiles the CLI + SDK + kernel + contracts + bundled plugins + zod into ONE self-contained ESM file (only `node:*` builtins external, shebang prepended at byte offset 0, version injected via `--define` so `paw --version` reports the released version) — zero runtime dependency resolution, honoring the lightweight-install requirement (spec section 61) without renaming the 18 `@proagents/*` workspace packages. New: `packages/cli/esbuild.mjs` (`bundle` script), `packages/cli/pack-npm.mjs` + `npm-README.md` (`pack:npm` script, stages `npm-stage/` — gitignored), npm-facing README, LICENSE file (MIT, matching every package.json), and `paw --version` / `paw version` (`--json` supported; documented but previously unimplemented). Publish documented as a blocking section of the release checklist (tarball rehearsal + cold registry install required); all install commands across README/docs/standards updated to the scoped name; repo package stays `proagents-workspace` per the CLI vocabulary standard.

### Removed

- **The control-room desktop application** (`app/`, `@proagents/ui`, `paw-ui`, the `paw desktop` command) and its product supplement (`PROAGENTS-WORKSPACE-UI.md`, spec section 145). Rationale (spec section 148): a desktop shell duplicated what the agent and the terminal already provide; the kernel, contracts, and CLI are the entire product surface. Also removed with it: the `node-pty` dependency and `pnpm ui` script at the root, the `scripts/live-verify-isolation.sh` harness (it drove the app server), and the `@proagents/ui` workspace entry. Spec section 145 is a TOMBSTONE — the number is retired, not renumbered; its surviving normative rules (interfaces are projections over kernel events, adapter surfaces report capabilities honestly) are restated in the section and still bind any future interface work.

### Changed

- All workspace packages bumped 0.2.0 → 0.3.0.
- `paw help` no longer lists `desktop`; `paw desktop` now returns the structured `COMMAND_NOT_FOUND` error (pinned by a test).
- Test suite reduced from 322 to 251 tests: the removed app's 71 integration tests (server, chats, wizard, terminal, editor, browser) left with the application; no product-level test was weakened.

## [0.2.0] - 2026-09-24

The convention-first release: the product's default experience becomes a
lightweight developer CLI around an existing repository, with workspace
research as the integration point to the ACC and ProAgents ecosystems
(spec sections 148–149). All workspace packages are bumped 0.1.0 → 0.2.0.

### Added

- **Convention-first local mode (spec section 148) — the product's default experience is now a lightweight developer CLI around an existing repository.** `paw init` makes the current repository Workspace-aware by creating ONLY `.paw/` metadata (minimal `workspace.yaml` — `version: 1` alone is valid — plus `sessions/`, `artifacts/`, and a non-clobbering `AGENTS.md`); it never touches source files, package.json, or Git state. `paw status` answers where am I / what project / what branch / what agents / what verification, with honest degradation (no git, no agents, no config are reported facts, never failures). `paw verify` infers checks from existing project conventions (package scripts: lint → typecheck → test → build) before asking for configuration; configured commands win. `paw agent list` reports detected agents with honest integration tiers; discovery is capability-based over declared probes (binaries + well-known config files), not hard-coded conditionals. Configuration precedence implemented: built-in defaults → global user config → project config → environment → CLI flags; simple commands boot no plugins (lazy activation, spec sections 37–38). New SDK convention layer (`detectProject`, `discoverEnvironment`, `inferVerification`, `initWorkspace`, `workspaceStatus`, `loadConfig`) with a dependency-free minimal YAML parser that fails honestly on unsupported syntax. `runtime` is now OPTIONAL in the workspace config schema (the host machine is the default runtime); `git` is not in the zero-config default tool set. `paw desktop` reports honestly that the UI is optional. New error code `PROJECT_NOT_INITIALIZED`. New commands: `init`, `status`, `research`, `doctor`, `verify`, `diff`, `agent list`, `config show`, `desktop`, bare `paw`.
- **Workspace research (spec section 149) — the integration point with the ACC/ProAgents ecosystems.** `paw research` consults context providers through the existing `ContextProvider` contract (ACC when installed, resolved generically — never imported by the SDK, honoring the dependency direction), gathers repository/environment facts with provenance, derives ONLY the product questions the environment cannot answer (goal/audience/definition-of-done; agent-level questions belong to ProAgents), and writes `.paw/research/research.json` + `product.md` + `decisions.md`. The interview loop is resumable (`paw research answer <id> <answer>`, `paw research status`). Agent-level requirements are handed to ProAgents via `.paw/proagents/requirements.json` — PAW never generates skills/rules/profiles itself; ACC-owned files (`AGENTS.md`, `.acc/`) are consulted, not duplicated. Without a context provider, research degrades honestly ("standard repository context").
- **Docs ↔ code pact test** (`test/integration/docs-code-pact.test.ts`): fails when any doc page or README claims the `paw` CLI is "specification only / not yet implemented" (the exact drift that previously shipped in `docs/agent-environment.md`), and bidirectionally checks that commands documented in `docs/cli-reference.md` match the built binary's help — including commands the CLI implements that the doc forgot (`paw config show`, `paw service list` were missing and are now documented). Negative-validated: reintroducing the drift phrase makes the test fail naming the offending file.
- **Chat retirement — settle & purge (T3-Code storage-cleanup model, README §147)**: `POST /api/chats/:id/settle` parks finished work without destroying anything (status `settled`, workspace + history + worktree stay on disk, resumable); `POST /api/chats/:id/purge` deletes the chat's workspace for good — GUARDED: uncommitted tracked changes or non-ignored untracked files refuse the purge (structured error, nothing deleted), explicit `force: true` destroys and honestly reports the destroyed work; purging a linked worktree runs `git worktree remove` against the source repo (no stale metadata); purge containment is absolute (only `<base>/chats/<id>` dirs are eligible). UI: ✓ Settle / 🗑 Purge chat actions with a settled badge + dimmed list entry and a confirm-then-force flow for dirty chats.
- Lifecycle definitions and harness adapters as plugins (completing spec §146 for the current surface):
  - `lifecycle` capability (16th entry in the §9 registry): `LifecycleProvider` contributes named lifecycle definitions as pure DATA via the SDK's new `definitions()` hook — a plugin cannot inject behavior, only reusable workflows. Two bundled definition plugins: `@proagents/plugin-lifecycle-web` (web-development: understand → plan → implement → unit/browser tests → review → ship) and `@proagents/plugin-lifecycle-security` (security-audit: understand → static review → threat model → verify findings → report). The control-room lifecycle library merges plugin contributions + `PAW_LIFECYCLE_JSON` + the built-in default (config wins on collision), `GET /api/lifecycles` exposes it with honest `source` labels (plugin|config|built-in), and the wizard gains a lifecycle picker bound to the chat's workspace entry.
  - Harness adapter plugins declare the same `runtime` descriptor as agent plugins (`agent-codex` now carries `capability: harness` + descriptor); the launchable-kind catalog dedupes agent and harness plugins into one row per kind with adapter lists — one catalog, two plugin families.
- Plugin-first architecture pinned as normative spec **section 146** (DeepSeek-Harness-inspired): everything that can be replaced, extended, configured, or composed is a plugin; the core provides runtime, contracts, lifecycle orchestration, events, permissions, and workspace isolation only. Additive contract support: plugin manifests may declare a `runtime` descriptor (`kind: process|service|external`, `command`, `label` — spec section 59) describing how the capability materializes outside the kernel. The agent CLI plugins and the DSH plugin declare their launch commands via the descriptor; the control room now derives the launchable agent-kind catalog (`GET /api/agents/kinds`) and harness launch commands from the plugin catalog's descriptors instead of hard-coded agent-kind→binary tables — a newly added agent plugin becomes launchable with zero product-layer code change. Consumers resolve declarations generically; the lifecycle engine never branches on provider names; default lifecycles/plugin sets are configuration data, never compiled-in behavior.
- Configurable development lifecycle per chat/workspace (spec sections 6/16): `lifecycle.definitions` + `lifecycle.default` in workspace.yaml and `lifecycle: { ref | inline }` per workspace entry, validated by Zod in `@proagents/contracts`. Kernel `LifecycleRunner` executes the resolved lifecycle with declarative failure semantics (only required stage failures fail the run; optional failures recorded honestly), emitting typed `lifecycle/*` events — stage EXECUTION is delegated to an injected `StageExecutor` (kernel purity, §139); `parallel` is advisory and reported as such.
- Wizard launch as a fully SEQUENCED provisioning pipeline (configure → terminal → clone/folder-bind → install packages → ACC + proagents scaffold → harness): every setup step runs as a real command in the workspace's REAL terminal and is awaited on its true exit code via the new `runCommandAwait` PTY primitive (split-sentinel marker, echo-race safe, real exit codes). A failed step keeps the raw shell, reports the failed step + exit code honestly (`provisioning.ok=false`), and recovery is one click (`POST /api/agents/:id/launch` + a `▶ Launch harness` button). `ensureGitAskpass` (0700, env-read at call time) moves GitHub authentication out of the typed command entirely; `GIT_TERMINAL_PROMPT=0` fails fast; `assertCloneTarget` rejects credential-embedding URLs. The ACC + proagents scaffold no longer clobbers an existing AGENTS.md or context file.
- Agent hiring + project connection in the control room: `@proagents/plugin-agent-cli` — CLI agent adapters for `claude`, `codex`, `opencode`, `gemini` (Tier-2 process adapters) with honest availability probing, `AGENT_PROVIDER_UNAVAILABLE` when missing, stderr surfaced verbatim on failure, and per-workspace activation. Hire flow (`POST /api/agents/hire`): declares a named workspace entry (reconstructable-from-config), mounts it through the kernel `WorkspaceManager` (own root, sandbox mode, plugin scope, session log), resolves the agent provider FROM the mounted scope, and starts the session. Project connection (`POST /api/projects/local`, `POST /api/projects/github`): local folders validated inside the base dir; GitHub repos clone through the guarded git plugin with an optional token (`PAW_GITHUB_TOKEN`/`GITHUB_TOKEN`) used inside the git URL only — scrubbed from every error path, never logged. Plugins activating into a workspace scope now receive their manifest permission grants via `refinePlugin` (merge semantics).
- Control-room web UI (`app/`, `@proagents/ui`) — the first runnable slice of `PROAGENTS-WORKSPACE-UI.md`'s MVP: boots a real kernel via `WorkspaceClient` with the bundled plugin catalog, serves a zero-build single-page control room (`paw-ui` / `pnpm ui`), and exposes the kernel as a projection — SSE event feed over the typed bus with `?after=N` resume, named-workspace mount/unmount (§141), session-log tails (§143), guarded shell + filesystem writes through the kernel providers, a real PTY terminal per workspace (node-pty, xterm.js vendored — no CDN), Agent Canvas, Inspector (`GET /api/agents/:id/inspect`), and a DSH-style static handler with traversal guard. Enforcement stays in the kernel: repo-shield/shell vetoes surface as structured `APPROVAL_REQUIRED` before execution (§101–102).
- Spec section 145 + `PROAGENTS-WORKSPACE-UI.md`: the desktop UI & product architecture supplement, pinning the kernel↔UI boundary — the UI is a projection over kernel events/session log, adapts to `HarnessProvider` capabilities, and reports enforcement tiers honestly.
- Spec sections 141–144: multi-workspace isolation (named workspaces, scoped service resolution, mount/unmount lifecycle, configuration-reconstructability), sandbox policy (modes, same-world confinement honesty, fail-closed semantics), the per-workspace append-only session log, and harness adapters (`HarnessProvider`, integration tiers `native`/`process`, normalized `session/*`/`model/*`/`compaction/*` lifecycle events). Typed contracts in `@proagents/contracts`: `HarnessProvider` with an honest integration tier (a process adapter can never claim native), `HarnessEnforcement` reporting whether a decision was actually applied and whether enforcement is blocking or advisory. Kernel implementation: `ScopedServiceRegistry`/`ShadowingServiceRegistry`, `WorkspaceManager` (concurrent mounts from a `workspaces:` map), `SessionLog` (append-only JSONL under `.paw/sessions/<workspace>/session.jsonl`, redacted, bounded tail); sandbox modes `read-only` / `workspace-write` (default) / `danger-full-access` — `filesystem` vetoes writes before execution under `read-only`, and `shell` fails CLOSED with `SANDBOX_UNAVAILABLE` because a host-process shell cannot enforce read-only confinement. New events `workspace/mounted`/`workspace/unmounted`; new error codes `WORKSPACE_ALREADY_MOUNTED`, `SANDBOX_UNAVAILABLE`, `SANDBOX_POLICY_VIOLATION`.
- TypeScript implementation of the Workspace as a plugin system (pnpm monorepo): `@proagents/contracts` (the 16 capability contracts of spec section 9, stable error codes §99, typed event map §7, Zod schemas for workspace.yaml and plugin manifests §59/§119), `@proagents/kernel` (event bus, service/capability registries, plugin discovery with dependency resolution and cycle detection, lifecycle state machine, declarative permission framework with approval modes §34, health aggregation §62–63, secrets-redacting structured logger §100), `@proagents/workspace` SDK (`definePlugin` + `WorkspaceClient`, §64), the `proagents-workspace` CLI (binary `paw`), eight capability plugins (filesystem, shell, git, runtime-local, runtime-docker, context-acc, agent-codex, repo-shield), the spec §91 lifecycle integration test, and e2e smoke tests for the CLI binary.
- Rebuilt ProAgents interview environment (fresh `proagent init` session): full topic questionnaire reaching READY at 80% confidence, generated agent-team spec (6 profile-bound members mirroring `.acc/config/agents/`), registry-standard crew installed at `.agents/crews/agent-team/`, and Freebuff established as the primary harness (`proagent setup --harness freebuff` compiled the composed skill, AGENTS.md profile block, and `.mcp.json`).

### Changed

- ProAgents agent environment revised post-convention-first: `proagents.yaml` project description updated from "V1 implementation lands per spec section 134" to the shipped reality (convention-first golden path per spec sections 148–149, V1 landed); the documented pipeline (`proagent resolve → lock → validate --spec → setup --harness freebuff`) re-run — all compiled artifacts (AGENTS.md profile block, .mcp.json, proagents.lock) regenerated BYTE-IDENTICAL, confirming the declaration was structurally in sync; `docs/agent-environment.md` corrected: `paw` is now marked Implemented (was "specification only"), and the honesty section states git guards are declarative in skill text but enforced by the product's guarded git plugin + repo-shield.
- README rewritten around the convention-first developer experience (install → `paw init` → use your existing agent → verify), with progressive layers introduced after the golden path; spec sections 50–55 updated to the implemented command surface with the ergonomic rule (`paw verify`, not `paw workspace verify`); spec section 148 fixes terminology — **Workspace** = the developer/project environment by default, **isolated/runtime workspace** = the heavier sandboxed mode.
- **Chat-workspace isolation (spec §36 honored, README §147)**: every chat creates its own NEW, EMPTY workspace under `chats/<chat-id>/` (unique suffix) and the selected project is MATERIALIZED INTO it — never bound in place, never shared. Local git repos materialize as a LINKED GIT WORKTREE with a per-chat branch; non-git folders are copied per chat (excluding `node_modules/`, `dist/`, `coverage/`, `.git/`, `.paw/`, `.acc/` — chats inherit code, not state); GitHub repos clone per chat. The wizard's step 1 becomes "Workspace: Empty (default) | Local folder | GitHub repo". The project registry is now a declarative source catalog. Isolation verified live (`scripts/live-verify-isolation.sh`, 20 checks).
- **Control-room UI redesign**: layered dark theme on a new token scale (--bg0..4, accent pair, shadows, --speed/--ease), sidebar with brand mark and selected-item rail, empty-state hero with feature chips, restructured chat header with labels that collapse to icons on narrow viewports, views-row wrapper so chat/code/terminal share one flex column, refined buttons/dialogs/tabs/status bar; honors `prefers-reduced-motion`, keeps visible focus rings; no markup id changes so every app.js handler keeps working.
- All workspace packages bumped 0.1.0 → 0.2.0 (18 package.json files).
- Root `package.json` is now the monorepo meta-package; workspace members live under `packages/`, `plugins/`, and `app/`.
- Permission grants are established before plugin activation, and plugins may refine scoped requests during activation (`PermissionFramework.refinePlugin`); grants remain intersected with configuration, so plugins can never self-grant (§59).
- `WorkspaceClient` accepts a `catalog` option: bundled plugin sets activate only when the workspace configuration references them.
- `paw doctor` aggregates provider-level health from registered capability services (service id included per entry).
- Crew brought to the registry crew folder standard: members bind registry profiles (`profile` field), every member carries an explicit permission model, context framework is `acc`; validated against PA043–PA048; installed via `proagent crew build` to `.agents/crews/agent-team/`.
- Environment-builder CLI upgraded to proagent v0.14.0; the full validation gate re-ran green on the new version (upstream graph/interview defects still present — patched locally, see Fixed).
- `docs/agent-environment.md` — new documentation page covering this repository's own ProAgents agent environment: the declaration files, compiled artifacts, the regeneration pipeline, and an honest statement of what is declared versus actually enforced. Wired into `docs/index.md` and cross-linked from `docs/agent-providers.md`.
- Documentation set unified on the `paw` binary (41 command examples migrated from the wrong `proagent-workspace` name); docs/verification.md and docs/cli-reference.md created (were linked but missing).

### Fixed

- proagent v0.13.0/v0.14.0 graph bugs (patched locally in the installed CLI): PA004 self-edge when the coordinator is also the documenter, and PA007 orphaned agents when the catalog matches more than one member per role; `proagent validate` reports 0 errors / 0 warnings after the patch.
- proagent v0.13.0 interview id-collision: derived follow-up questions reuse ids of already-persisted seed questions and are silently dropped; worked around by injecting the question into the session file.
- Stale OpenCode artifacts removed: `opencode.json` (denied rules never applied on Freebuff) deleted; all skill text now names the freebuff harness.
- Documentation CLI naming inconsistency and broken documentation index links found by the link check (see Changed).

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

[0.3.0]: https://github.com/EnzoVezzaro/proagents-workspace/releases/tag/v0.3.0
[0.2.0]: https://github.com/EnzoVezzaro/proagents-workspace/releases/tag/v0.2.0
[0.1.0]: https://github.com/EnzoVezzaro/proagents-workspace/releases/tag/v0.1.0
