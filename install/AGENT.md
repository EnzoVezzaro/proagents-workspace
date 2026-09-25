# AGENT.md — the bootstrap protocol (spec section 152)

This file is part of this repository's `install/` contract folder —
`manifest.yaml` (package metadata), `install.yaml` (the install contract as
data), `instructions.md` (the human-facing guide), and this protocol. An
agent that reads only this file has everything it needs.

You are an AI coding agent (Claude Code, Codex, Gemini CLI, OpenCode, …)
and a human asked you to "setup ProAgents Workspace" for this repository —
or pointed you at the repository https://github.com/EnzoVezzaro/proagents-workspace.
You do not need any prior knowledge of ProAgents Workspace. Follow this
protocol exactly.

## The protocol

1. **Inspect the target repository and start the workspace from its own
   words.** Run the deterministic installer — passing the project's
   description file (a README, a brief, any text file) so the inferred
   intent is persisted into the configuration:

   ```bash
   npx @reposell/proagents-workspace@latest init README.md
   ```

   No file at hand? Plain `init` still works — intent is then inferred
   from the repository's README and manifests. The `paw` binary already
   installed? `paw init README.md` is the same six-stage machine (the
   spelling `paw install <file>` is a stable alias). An EMPTY repository
   (no code, no README)? The installer reports a five-question interview:
   answer it headlessly with `paw init --answers "web app" "one sentence"
   "TypeScript" "open source" "guarded"`.

   It never modifies application code, never rewrites manifests, and never
   changes git state. Its full report is machine-readable with `--json`.

3. **Preserve existing instructions.** Existing `AGENTS.md`, `CLAUDE.md`,
   `.cursorrules`, `.paw/` configuration, and every source file are
   preserved, never overwritten. If the installer reports it created
   `AGENTS.md`, review it and add project-specific guidance after the
   generated notes.

4. **Confirm the result.** Run:

   ```bash
   npx @reposell/proagents-workspace@latest status
   ```

   It reports where you are, what the project is, what verification is
   configured, and which agents are available — absence of pieces is a
   reported fact, never a failure.

5. **Report the resulting configuration** back to the human: the install
   report (six stages), the verification plan, the lifecycle phases, and
   anything the human should decide (e.g. verification commands that could
   not be inferred).

## Rules

- Do not skip step 1 in favor of hand-creating `.paw/` files — the
  installer is the deterministic path and stays idempotent. What it writes
  and what it never touches are declared in `install.yaml` next to this
  file.
- `install` is an alias of `init`, never a different machine — both report
  the same six stages: resolve → acc → shield → proagents → reposell → paw.
- Do not modify application code unless the human explicitly asks for it.
- Do not run the project's tests unless the human asks (or pass `--verify`
  to the installer to do both in one step).
- The lifecycle (create → research → initialize → plan → develop → verify
  → release → distribute → operate) is the workspace's spine; show it with
  `npx @reposell/proagents-workspace@latest lifecycle show`.
