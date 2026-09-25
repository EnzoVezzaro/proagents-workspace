# PAW Installation Runbook

The complete execution contract for an AI coding agent that must **install**, **set up**, and **complete** a ProAgents Workspace (`paw`) installation in a target repository. It is grounded in the repository's own install contract (`install/install.yaml`, spec section 152) and folds in the operating discipline needed to finish a long run unattended and to report honestly.

This file is the agent's **HOME**. It points to the **DOCS** (each `paw` command has a canonical page) and gives the **TERMINAL** commands to run.

## Start Here

Hand the coding agent the whole task, the finish line, and the stop conditions in one instruction, then let it work:

```text
Read docs/paw-install-runbook.md completely, then install, set up, and complete a ProAgents Workspace in this repository.

Done means: the deterministic installer has run, .paw/workspace.yaml exists with an honest project block, the verification plan is configured, paw status/doctor/check are healthy, paw verify (or the project's own gate) has run, the final diff contains only expected Workspace artifacts, and you report the exact files, evidence, limitations, rollback path, and anything you could not confirm.

Keep going when the next step is reversible and needs no policy decision. Stop and ask only before granting or changing write/production/secret/network/publish permission, running the project's tests if I did not ask, upgrading a global CLI, deleting data, force-pushing, or any other destructive or external action.
```

Do not add "think carefully" or "think step by step" lines. State the outcome and the evidence instead.

## Scope and product boundary

ProAgents Workspace is one product in a family. Install only what was asked.

| Request | Product | CLI | Config |
|---------|---------|-----|--------|
| Prepare, verify, and observe the environment an agent works in | ProAgents Workspace | `paw` | `.paw/` |
| Give an agent a profession or a crew | ProAgents | `proagent` | `proagents.yaml`, `.proagent/`, `.agents/` |
| Tell agents how to operate (contracts, workflows, standards) | ACC | `acc` | `AGENTS.md`, `.acc/` |

- This runbook installs **Workspace** (`paw`). It does not install ProAgents or ACC.
- Workspace is **WHERE** an agent works; it never replaces **WHO** (ProAgents) or **WHAT** (ACC). See [Product Model](product-model.md).
- Optional integrations (ACC context, Docker/E2B runtimes, ProAgents handoff) are progressive; their absence is never a failure.
- If the request needs ProAgents/crew setup as well, finish the Workspace here, then configure the crew separately. Workspace hands requirements to ProAgents via `.paw/proagents/requirements.json`; it does not run the ProAgents installer.

## Agent operating playbook

Adapted from the "Getting the most out of Opus 5.5" playbook so the agent can finish the job entirely and be checked afterward.

### Frame the whole run

Ask for or derive, in one message:

1. The whole task (install + set up + complete a Workspace here).
2. The exact finish line (the completion gates below, all green).
3. The target repository and allowed scope.
4. The stop conditions.
5. The validation and reporting requirements.

With a clear finish line, keep going. Do not stop with "want me to continue?" after a non-blocking step — pair a short status note with the next action.

### Tell it which stops you want

Put this rule in the target's agent instructions (`AGENTS.md`) or the prompt, and honor it:

```text
When a step doesn't need my input, keep going. Put status notes in the same message as your next action.
Stop and ask only when you can't continue without me, or before anything destructive: deleting data, force-pushing, using secrets, or changing anything outside this repository.
```

Keep permission prompts on for destructive commands.

### Split big work across subagents

For a large audit, migration, or review, give each subsystem or review dimension to its own subagent, check every subagent's evidence before accepting it, and finish with one consolidated table. Do not use subagents to make permission, production, or destructive decisions.

### Keep the task list in a file

A long run fills the context window and older turns get summarized. Keep a durable checklist in a file and update it as you go, so progress survives and is readable at a glance. In this repository prefer the harness task tracker; otherwise use `.paw/setup-tasks.md` and never overwrite an existing progress file. Tick each item when done and add anything new you find.

### Steer a running task

If a requirement surfaces mid-run, add it without restarting: "also preserve the existing AGENTS.md" or "do not configure a runtime yet."

### Give it the source, ask for the file

Attach the README, config, or screenshot rather than retyping. For research and inference, ask it to quote contradictions with their location. When you want a configuration or report, ask for the finished file, not an outline.

## Safety and preservation rules

- Work only in the confirmed target repository. Read its agent instructions, README, and manifests before writing.
- Inspect `git status --short --untracked-files=all` before and after setup. Preserve every pre-existing change.
- Never use `git reset --hard`, `git clean`, force-push, branch deletion, or history rewriting to recover from a failed install.
- The installer is metadata-only: it never modifies application code, never rewrites `package.json` or any manifest, and never changes git state (no add, commit, branch, push). Do not hand-edit application code unless asked.
- Do not hand-create `.paw/workspace.yaml` or `AGENTS.md` when the installer can do it deterministically. Edit the source or config, not generated output.
- Never put credentials in prompts, command arguments, committed files, or reports. Secrets are injected at runtime and never logged.
- Keep filesystem, network, secret, production, and publish permissions explicit and least-privileged; require human approval for production, publishing, and deployment.
- Default Git behavior is conservative: force push, branch deletion, `reset --hard`, and history rewriting are guarded by [protection](protection.md). Do not work around a protection block.
- `local` is the default runtime and is host-level — it is **not** a sandbox. Report it honestly; do not claim isolation you did not create.

## Preflight

Run from the target repository root and record the baseline before changing anything:

```bash
node --version            # require >= 18
paw --version             # if already installed; else install in Phase 1
paw status                # where am I / what is here
paw doctor                # health of workspace + providers (optional comps are not failures)
paw check                 # self-diagnostics; stable PAW0xx codes, never mutates
git status --short --untracked-files=all
```

Notes:

- A README-less, manifest-less directory still installs; inference reports `derived from: no manifests or README` rather than inventing facts.
- `.paw/` existing does not mean initialized — an empty or partial `.paw/` still reports `not initialized` in `paw status`. `paw status` is the source of truth.
- Record pre-existing findings; unrelated problems are pre-existing debt, not proof the new install failed.

## Phase 1 — Install

### Install the CLI (or skip it)

The installer can run straight from `npx` with nothing pre-installed. Choose one:

```bash
# One-shot, no global install (the bootstrap default)
npx @reposell/proagents-workspace@latest init [BRIEF.md]

# Or install the CLI once, then reuse `paw`
npm install -g @reposell/proagents-workspace
paw init [BRIEF.md]        # alias: paw install [BRIEF.md]
```

Requires Node.js 18+. No account, token, Docker, or desktop app. If a global `paw` is already installed, record its version and stop before upgrading it (an upgrade can change output and overwrite local fixes).

### Run the deterministic installer (six stages)

The installer is the supported path; it is idempotent and metadata-only. Pass the project's own description file (a README, a brief, any text file) so the inferred intent is persisted as the `project:` block in `.paw/workspace.yaml`:

```bash
paw init            # default source: @README.md
paw init README.md  # intent inferred from README.md
paw init --json     # machine-readable six-stage report (what external agents parse)
paw init --verify   # install, then run the verification checks
paw init --answers "web app" "one sentence" "TypeScript" "open source" "guarded"
                    # headless questionnaire for empty repositories
```

`npx @reposell/proagents-workspace@latest init` and `paw init` (alias `paw install`) are the same six-stage machine.

| Stage | What happens | Writes | Preserves |
|-------|--------------|--------|-----------|
| resolve | Detect languages, runtime, package manager, frameworks, monorepo, coding agents; decide where identity comes from (code + README, else README, else code, else the questionnaire) | — | — |
| acc | Write the ACC knowledge layer from detected languages only | `.acc/config/config.yaml` | existing `.acc/` |
| shield | Write the Repo Shield policy — what must never happen | `.reposhield/policy.yaml` | existing `.reposhield/` |
| proagents | Write profiles, the crew (wired to ACC context), and the environment config | `.proagents/` | existing `.proagents/` |
| reposell | Write the distribution posture (consumed, never re-implemented) | `.reposell/distribution.yaml` | existing `.reposell/` |
| paw | Create `.paw/` LAST; write `AGENTS.md` when absent; report verification plan + lifecycle | `.paw/`, `AGENTS.md` | existing `.paw/workspace.yaml`, existing `AGENTS.md` |

The installer's `never` list (the contract, mirrored by tests): it never modifies application code, never rewrites `package.json` or any manifest, never changes git state, never overwrites an existing configuration file, never writes into `.agents/` (agent-owned), and never requires an account, token, or network access beyond `npx` itself.

Exit codes: `0` install completed (all six stages; a `needs-input` resolve — the questionnaire — is still exit 0); `1` install failed (structured error on stderr). An unreadable source file is a structured `INTENT_SOURCE_UNREADABLE` error.

The SDK is `@proagents/workspace`; the CLI and SDK share the same implementation.

## Phase 2 — Set up the workspace

Confirm what the installer produced, then configure what it could not infer.

```bash
paw status          # where am I, what is this project, which agents, what verification
paw doctor          # provider/component health
paw lifecycle show  # the canonical phases this workspace runs
paw agent list      # detected agents + honest integration tiers
paw config show     # effective configuration and where each layer came from
```

### Configure verification

With no configuration, `paw verify` infers checks from project conventions (package scripts in the order lint → typecheck → test → build). Configured commands in `.paw/workspace.yaml` win over inference. If inference is wrong or empty, set them explicitly:

```yaml
version: 1
verification:
  commands:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build
```

Use `paw config get` / `paw config set` for layered settings. See [Configuration](configuration.md) for the full `workspace.yaml` reference.

The `project:` block (`productType`, `domains`, `skills`, `derivedFrom`) is generated by the installer as informational metadata that names its sources; the workspace runs identically without it. It is strict-schema — prefer to let the installer produce it than to hand-write it.

### Optional, progressive setup

- **Research** (product/environment discovery, ACC-aware): `paw research`, `paw research answer <id> <answer>`, `paw research status`. Artifacts land in `.paw/research/`; agent requirements are handed to ProAgents via `.paw/proagents/requirements.json`.
- **Isolated runtime workspace** (CI, untrusted, parallel agents): `paw workspace create --repo <ref> --runtime docker|e2b --branch <name>`. `local` is the default and is not a sandbox.
- **Reproducibility**: `paw workspace export <id>` emits a `workspace.yaml`; `paw workspace create --from <workspace.yaml>` recreates the workspace. Verify the round trip.
- **Checkpoint plans** (quality gates): `paw checkpoint list` / `paw checkpoint run`, loaded from `.paw/checkpoints.json`. `attempt ≠ completion` — only passing gates complete a checkpoint.
- **Headless / CI**: `--headless` fails closed on approvals; `--json` gives machine-readable output for every important command.

Do not run the project's tests or build unless asked, or pass `--verify` to the installer to do both in one step.

## Phase 3 — Complete: verify, check, smoke test, report

Run the applicable gates:

```bash
paw verify           # run detected/configured verification (or: paw verify test|build|lint|typecheck)
paw check            # framework + workspace drift, stable PAW0xx codes, never mutates
paw doctor           # health; optional components never fail
paw status           # must now report an initialized workspace
git diff --check
git status --short --untracked-files=all
```

| Gate | Completion condition |
|------|----------------------|
| install | Exit `0`; six stages reported |
| status | Reports an initialized workspace |
| doctor | Required components ready; optional ones marked optional, not failed |
| check | `PASS` — no error-severity findings |
| verify | Configured checks ran and their real result is recorded |
| diff | Only expected `.paw/` (and `AGENTS.md` when absent before) changes |
| repo gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (or the project's own gate) if source/config changed |
| smoke test | Target agent loads the profile/notes, or is marked unverified |

`paw verify` reflects the project's real test result. Report a failing test as a failure; never claim a green gate you did not observe.

### Runtime smoke test

CLI health proves configuration, not that the active agent loaded it. If a harness is available:

1. Start a fresh agent session or reload the project in the target repository.
2. Ask the agent to summarize the project and the verification plan from the generated notes.
3. Confirm the answer matches `.paw/workspace.yaml` and `AGENTS.md`.

If no harness or credentials are available, mark the smoke test **unverified**. Do not replace it with "the files exist."

## Checking the result (self-review)

Before reporting completion:

1. **Read what it needs from you first** — any decision it left open or change awaiting approval, then the rest of the summary.
2. **Review the diff before a human does** — run an independent pass that lists only merge-blocking or setup-blocking problems, each with file, line, why it's wrong, and how to show it fails.
3. **Re-run the gates after any fix.**
4. **Mark what you could not confirm**, and say where you looked. "I couldn't find this" is worth reading.

Do not ask a model to expose hidden reasoning. Ask for a short rationale, evidence, and uncertainty instead.

## Interrupts and flags

- If a safety filter, protection gate, or approval policy blocks a command, **do not evade it**. Use the supported path: obtain the approval, or run headless (fail closed) and report the block. Never disable protection to force a result.
- If the session is switched to a different model or loses context, re-read this file and the task file to re-ground before continuing; do not assume prior steps completed.
- If a legitimate security or verification finding is flagged, resolve it at the source. Do not work around a safeguard.

## Failure handling

- **install exits 1** — read the structured error on stderr, fix the cause, and re-run; the installer is idempotent, so a retry changes nothing the second time.
- **`INTENT_SOURCE_UNREADABLE`** — the source file could not be read; pass a readable file (or omit it to infer from `README.md`).
- **`AGENTS.md` was not created** — it already existed and is preserved. Add project-specific guidance after the generated notes by hand.
- **Verification not inferred or wrong** — set `verification.commands` in `.paw/workspace.yaml` explicitly; do not run tests to "find out."
- **`paw doctor` shows optional components missing** — expected and not a failure (ACC, Docker, E2B, Go, Cursor rules).
- **A protection block stops a Git operation** — expected. Do not force-push, delete branches, or rewrite history to get past it.
- **Setup changed unexpected files** — stop, inspect the full diff, and restore only files this run demonstrably created, using a reversible edit. Do not reset the repository.
- **`paw check` reports drift (`PAW0xx`)** — fix the referenced file/manifest per its suggestion; `paw check` never mutates, so the fix is yours to make.

## Rollback

The install is metadata-only and idempotent, so rollback is small and reversible.

- Remove `.paw/` (it is Workspace-owned and git-ignored) if the user wants a clean slate; this is the only Workspace surface the installer creates.
- Restore `AGENTS.md` from version control if the installer created it and the user wants it gone.
- Revert any explicit `verification`/`project` edits to `.paw/workspace.yaml` by hand.
- Never use a broad repository reset, `git clean`, or history rewriting as installation rollback.

## Security and enforcement honesty

- Protection intervenes **before** an operation executes; it is not an after-the-fact log. See [Security](security.md) and [Protection](protection.md).
- The default `local` runtime is host-level, not a sandbox. Say so plainly; do not present local execution as isolated.
- Secrets are injected at runtime, scoped, and never logged. Keep production, publish, secret, and external-network operations approval-gated.
- `paw check` and `paw doctor` are deterministic diagnostics, not a threat model or penetration test.
- Workspace is not a payment processor; distribution licensing is owned by the distribution provider.

## Final report template

Order it so decisions and blockers are visible first:

```text
Status: complete | blocked | unverified

Needs from user
- <decision, approval, credential, or none>

Installed
- paw version and Node version
- install source file used
- .paw/workspace.yaml project block summary (with sources)
- verification plan configured
- lifecycle phases shown
- agents detected (with tiers)
- optional integrations enabled or not (ACC / runtime / ProAgents handoff)

Changed
- <path and why — expect .paw/, AGENTS.md only if absent, explicit config edits>

Evidence
- <command> — <result>   (install, status, doctor, check, verify, git diff)
- <repository gate> — <result>

Limitations
- local runtime is not a sandbox; advisory-only enforcement; skipped smoke test; optional components not installed

Unconfirmed
- <claim not verified, and where it was checked>

Rollback
- <exact reversible path; never a broad reset>
```

## Final checklist

Asking
- [ ] The task names what "done" looks like and when to stop
- [ ] No "think hard" filler in the instructions
- [ ] The target repository and existing state were inspected

Install
- [ ] Node >= 18 and `paw` version recorded
- [ ] Deterministic installer ran (source file passed); exit 0
- [ ] `.paw/workspace.yaml` exists with an honest `project:` block
- [ ] Existing `AGENTS.md` / `.paw/` preserved; app code and git state untouched

Set up
- [ ] `paw status` reports an initialized workspace
- [ ] Verification configured (inferred or explicit)
- [ ] Lifecycle and agent tiers reviewed
- [ ] Optional integrations (ACC / runtime / ProAgents handoff) decided, not assumed

Complete
- [ ] `paw doctor` required components ready
- [ ] `paw check` PASS
- [ ] `paw verify` (or repo gate) run; real result reported
- [ ] Final diff reviewed (setup-blocking review pass done)
- [ ] Runtime smoke test done or marked unverified
- [ ] Final report includes limitations, unconfirmed items, and rollback

## Related

- [Agent Bootstrap](bootstrap.md) — the one-line six-stage install contract
- [Getting Started](getting-started.md) — install, create, connect an agent
- [CLI Reference](cli-reference.md) — every `paw` command
- [Configuration](configuration.md) — `.paw/workspace.yaml` reference
- [Lifecycle](lifecycle.md) — the canonical phases
- [Verification](verification.md) — the verification loop
- [Security](security.md) and [Protection](protection.md) — permissions and git guards
- [Agent Providers](agent-providers.md) · [Runtime Providers](runtime-providers.md) · [Context Providers](context-providers.md)
- [Self-Diagnostics](health-checks.md) — `paw check` (`PAW0xx` codes)
