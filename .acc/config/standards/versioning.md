# versioning.md — Versioning & Backward Compatibility Standard

Grounded in spec sections 120–121 and 134–136.

## What Is Versioned (spec section 120)

```text
Workspace API · provider contracts · plugin contracts
Workspace configuration · snapshots
```

Provider implementations declare compatible API versions. Nothing else gets a version number that matters.

## Rules

- **Semver for packages.** Breaking = major; capability = minor; fix = patch.
- **Contracts are append-only within a major version.** New contracts may be added; published contracts are never renamed or repurposed.
- **Breaking contract changes require a version bump AND a migration path** — detect old version → migrate → validate → report (spec section 121).
- **The `--json` envelope and error codes are stability contracts.** Field removal or type change requires a schema major bump; error codes are never reused.
- **Spec section numbers are stable identifiers** — docs cite them; they are never renumbered.
- **Snapshots carry the version** of the configuration/runtime that produced them; restoring reports incompatibilities instead of guessing.

## Compatibility Discipline

- Do not break existing Workspace configurations unnecessarily (spec section 121).
- The first-five-minutes flow must never break (spec section 122):
  ```bash
  npm install -g proagents-workspace
  paw workspace create --repo github:myorg/myrepo --runtime docker
  ```
- The zero-cloud path must keep working across releases (spec section 123).
- Plugin compatibility: a plugin declares the contract versions it implements; the kernel loads it only when versions are compatible — and reports conflicts with the exact version numbers on both sides.

## Release Discipline (spec sections 134–136)

- V1 scope is fixed: kernel, CLI, local + Docker runtimes, Git, repository provider, GitHub provider, ACC provider, filesystem, shell, agent provider, verification, workspace configuration, logs.
- E2B, MCP, secrets, browser, snapshots, services, remote API come after V1.
- A release is done when the Definition of Done checklist (spec section 136) passes: workspace create/destroy/inspect/export/recreate; local + Docker runtimes; provider-neutral abstraction; context; agents; verification; security; developer experience.

## Migration Checklist (for any breaking change)

- [ ] Old configuration detected and identified by version
- [ ] Migration executed automatically where possible
- [ ] Migrated configuration validated with the current schema
- [ ] Migration reported to the user — what changed, what was moved
- [ ] Documentation updated in the same release
