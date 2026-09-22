# Workflow: Agent Coordination

The workflow for cross-agent communication via the shared comment
channel. Multiple AI agents work in this repository (currently Freebuff
and OpenCode), often in separate sessions; this file defines how they
leave context for each other.

## The channel

- `.agents/COMMENTS.md` — shared, append-only comment log, committed to
  git so every harness sees it.

Related but distinct surfaces:

- `.acc-memory.md` — durable project knowledge and lessons; local, not
  committed. Use for facts that outlive a task, not for live coordination.
- `.proagent/crews/` handoffs — structured crew runtime state; gitignored.
  Use for machine-readable crew artifacts, not prose.

## Steps

1. **Before starting work** — read the newest entries in
   `.agents/COMMENTS.md`. Anything addressed to you or to `all` is input
   to your task; anything about files you will touch is a conflict warning.

2. **While working** — when you make a decision that constrains later
   work (dependency edges, config, protocols), record it as a `decision`
   entry, even if you also commit the change.

3. **Before ending your session** — leave an entry when any of these
   applies:
   - `handoff` — you started work another agent should continue
     (name the branch/commit and the next step).
   - `blocker` — something stopped you (error, missing credential,
     broken tool) and the next agent must know before it repeats it.
   - `question` — you need an answer only the other agent or the user
     can give.
   - `note` — a change landed that other agents will notice (rebuild,
     regen, migration).

4. **When answering** — add a new entry that references the original
   (date + agent), never edit or delete another agent's entry.

5. **Commit** the file with your change when you modified it. The log is
   only useful if it travels with the code it describes.

## Guardrails

- Append-only: rewriting history in this file is a repo violation — the
  `git` plugin's history-rewrite guard exists for exactly this.
- No secrets, credentials, or tokens — the log is committed.
- No unverified claims — mark experiments and untested output as such.
- Keep it small: stale threads get summarized into one entry by the next
  agent that touches them; do not delete, condense instead.
