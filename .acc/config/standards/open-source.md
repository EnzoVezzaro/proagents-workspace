# open-source.md — Open Source Standard

The repository and community standard for ProAgents Workspace. Grounded in spec sections 117, 122, 134–136.

## Repository Structure (spec section 117)

```text
proagents-workspace/
├── packages/    # core, cli, sdk, runtime, repository, context, agent,
│                # filesystem, shell, terminal, network, secrets, storage,
│                # verification, observability — contracts & kernel, no providers
├── plugins/      # github, git, acc, e2b, docker, local, codex,
│                # claude-code, opencode, mcp — concrete implementations
├── examples/
├── templates/
├── docs/
├── tests/
└── scripts/
```

The exact layout may change during implementation. The rule may not: **capability contracts and concrete implementations remain separated.**

## Licensing

- Project license: **MIT**.
- Every published package carries the license field; every third-party dependency is MIT/Apache-2.0-compatible.
- Vendored code keeps its original license header and attribution.

## Release Discipline (spec sections 134–136)

- V1 first: kernel, CLI, local + Docker runtimes, Git, repository provider, GitHub provider, ACC provider, filesystem, shell, agent provider, verification, workspace configuration, logs.
- Then: E2B, MCP, secrets, browser, snapshots, services, remote API.
- A release passes the Definition of Done (spec section 136) and the documentation release checklist (`.acc/config/workflows/release.md`) — both are blocking.
- No "big bang" releases — the golden path ships first and keeps working.

## Community Rules

- `README.md` is the canonical spec; contributors propose changes through `.acc/config/workflows/spec-change.md`.
- Issues are actionable: expected behavior, actual behavior, spec section if known.
- Breaking changes are never shipped silently — migration notes are mandatory (spec section 121).
- The first five minutes decide everything (spec section 122): a new user must be able to install and create a workspace without reading beyond the Getting Started doc. If the happy path requires a secret, a cloud account, or a config file, it is broken.

## Contribution Flow

1. Contributor reads the root `AGENTS.md` contract and the relevant local contract.
2. Documentation changes → `.acc/config/workflows/feature.md`; spec changes → `spec-change.md`; code changes → `code-change.md`.
3. `acc check` passes; verification commands pass.
4. PR description follows `.acc/config/templates/pull-request.md`.
5. Security-relevant changes pass `.acc/config/workflows/security-review.md`.

## Attribution

- The ecosystem is credited by name everywhere: ProAgents (WHO), ACC (WHAT), Workspace (WHERE), Repo Shield (protection), reposell (distribution).
- The Workspace must remain usable and mentionable without ProAgents and without ACC (spec section 1) — the docs never imply hard coupling.
