# Pull Request Template

The PR description format for ProAgents Workspace — the same structure the product itself generates (spec section 39). Copy into the PR body and fill. Verification results must be real; never paste expected results.

```markdown
Summary
-------

{{What this change does and why. One to three sentences.
Reference the spec section it implements or updates.}}

Changes
-------

- {{Change 1}}
- {{Change 2}}
- {{Change 3}}

Verification
------------

{{✓ / ✗ per step — from an actual `paw verify` / `pnpm` run}}

✓ Lint
✓ Typecheck
✓ Unit tests
✓ Build
✓ acc check (0 diagnostics)

Security
--------

{{"None — no permissions/secrets/network/Git/runtime-isolation surface touched."
Or: list touched surfaces and confirm `.acc/config/workflows/security-review.md` passed.}}

Docs
----

{{"None — no behavior change."
Or: spec + docs updated in this PR (spec changes never ship without docs sync).}}

Breaking changes
----------------

{{None. Or: migration path per `.acc/config/standards/versioning.md` —
detect old version → migrate → validate → report.}}
```

## Rules

- Verification lines come from a real run in this branch — if a step fails, the PR says so.
- Security-relevant changes (permissions, secrets, network, Git, protection, runtime isolation) cannot merge without the security review verdict.
- Spec behavior changes include the docs sync in the same PR (`.acc/config/workflows/spec-change.md`).
- No force push to shared branches; no history rewriting (spec section 35).
