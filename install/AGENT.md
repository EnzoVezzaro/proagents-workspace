# AGENT.md — the bootstrap protocol (spec section 152)

You are an AI coding agent (Claude Code, Codex, Gemini CLI, OpenCode, …)
and a human asked you to "setup ProAgents Workspace" for this repository —
or pointed you at the repository https://github.com/EnzoVezzaro/proagents-workspace.
You do not need any prior knowledge of ProAgents Workspace. Follow this
protocol exactly.

## The protocol

1. **Inspect the target repository.** Run the deterministic installer:

   ```bash
   npx @reposell/proagents-workspace@latest install
   ```

   It never modifies application code, never rewrites manifests, and never
   changes git state. Its full report is machine-readable with `--json`.

2. **Read the target's README and existing agent instructions.** The
   installer already derived the project intent (product type, domains,
   technologies) from them — its `understand` phase report tells you what
   it inferred and from which files.

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
   report (five phases), the verification plan, the lifecycle phases, and
   anything the human should decide (e.g. verification commands that could
   not be inferred).

## Rules

- Do not skip step 1 in favor of hand-creating `.paw/` files — the
  installer is the deterministic path and stays idempotent.
- Do not modify application code unless the human explicitly asks for it.
- Do not run the project's tests unless the human asks (or pass `--verify`
  to the installer to do both in one step).
- The lifecycle (create → research → initialize → plan → develop → verify
  → release → distribute → operate) is the workspace's spine; show it with
  `npx @reposell/proagents-workspace@latest lifecycle show`.
