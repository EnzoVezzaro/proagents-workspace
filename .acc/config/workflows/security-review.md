# Workflow: Security Review

The review gate for security-relevant changes in ProAgents Workspace. Run it before any change touching permissions, secrets, network, Git operations, protection, or runtime isolation.

## When to use

- Changes to permission, approval, or network configuration code
- Changes to any provider that executes commands or touches credentials
- Changes to the protection layer or its policies
- Changes to runtime isolation (Docker, local, E2B, Kubernetes)
- New plugins declaring `network`, `secrets`, or `git` permissions

## Steps

1. **Assign the reviewer.**
   - `.acc/config/agents/security-reviewer.md` runs this gate. The author must not self-approve security-relevant changes.

2. **Read the rules.**
   - `.acc/config/standards/security.md` — the full standard
   - `docs/security.md` and `docs/protection.md` — the product security model
   - Root `AGENTS.md` Constraints

3. **Check the change (blocking).**
   - Protection intervenes **before** execution — no after-the-fact logging paths (spec sections 101–102).
   - Permissions are declarative and enforced — no silent capability grants.
   - Secrets: injected at runtime, scoped, never logged, never stored in images or config files.
   - Network: explicit; no undeclared egress; deny-by-default in restricted mode.
   - Git safety: force push, branch deletion, `reset --hard`, `clean -fd`, history rewriting guarded by default.
   - Install scripts: never executed blindly — Workspace security policy applies first.
   - Honest reporting: isolation level and network policy visible; local never presented as a sandbox.

4. **Run the diagnostics.**
   ```bash
   acc check
   ```
   - Fix any error before proceeding; warnings need an explicit disposition.

5. **Report.**
   - Verdict per rule: pass / violation (rule + location + fix).
   - Violations are blocking — there is no "acceptable" security violation.

6. **Record durable knowledge.**
   ```bash
   acc memory add . "<lesson learned>"
   ```

## Guardrails

- If the reviewer is unavailable, the change waits — security review is not skippable.
- Disagreements escalate to the maintainers with the rule text quoted; the standard is not renegotiated per change.
