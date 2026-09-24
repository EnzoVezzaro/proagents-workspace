# Agent Notes

<!--
Template (spec section 152) — written by `paw init` / `paw install` into a
target repository ONLY when no AGENTS.md exists. Existing instructions are
always preserved. Placeholders in {{...}} are filled from detection.
-->

This repository is a ProAgents Workspace (`.paw/`).

- Languages: {{languages}}
- Package manager: {{packageManager}}
- Frameworks: {{frameworks}}
- Product type (from README): {{productType}}
- Verification: {{verification}}

## Working here

- Run `paw status` for the workspace picture (what is here, what is possible).
- Run `paw verify` to execute the verification checks above.
- Run `paw lifecycle show` to see the phases this workspace runs
  (create → research → initialize → plan → develop → verify → release →
  distribute → operate).
- `.paw/` is workspace metadata; application code lives outside it and is
  never modified by workspace commands.
