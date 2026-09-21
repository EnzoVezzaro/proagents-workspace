# architecture.md — ProAgents Workspace Architecture Standard

This standard is referenced by `AGENTS.md` files across the repository. It defines the architecture expectations that every document, spec change, and future implementation must follow.

## Critical Architectural Rule (spec section 139)

```text
Do not solve provider-specific problems in the kernel.
```

- GitHub needs special behavior → GitHub provider.
- ACC needs special behavior → ACC provider.
- E2B needs special behavior → E2B runtime provider.
- Codex needs special behavior → Codex agent adapter.
- Repo Shield needs special behavior → Protection provider.
- reposell needs special behavior → Distribution provider.

The Workspace contracts remain stable. The product grows by adding capabilities (providers/plugins), never by increasing core complexity.

## Kernel Boundary

The kernel owns exactly:

```text
configuration · plugin discovery · dependency resolution · lifecycle management
service registry · capability registry · event bus · command registration
logging · health checks · permission framework
```

The kernel does **not** contain provider-specific business logic. Capabilities are requested through service definitions (`services.get(repositoryProvider)`), never by direct instantiation (`new GitHubService()` is forbidden in examples).

## Layered Architecture

```text
Kernel: lifecycle · services · events · permissions
   │
   ├── Runtime providers      (E2B, Docker, local; future: Kubernetes, Firecracker)
   ├── Repository providers    (GitHub, GitLab, Bitbucket, Gitea, generic Git)
   ├── Context providers       (ACC, filesystem, language-server, tree-sitter)
   ├── Agent providers         (Codex, Claude, OpenCode, Gemini, ProAgents)
   ├── Tool & service layer    (MCP, browser, database, storage, secrets)
   └── Cross-cutting layers    (Protection — Repo Shield; Distribution — reposell)
```

Each provider depends only on the kernel contracts. No provider-to-provider hard coupling; coordination happens through typed events.

## Capability Contracts

Versioned and stable (spec section 9):

```text
RuntimeProvider · RepositoryProvider · ContextProvider · AgentProvider
FilesystemProvider · ShellProvider · TerminalProvider · NetworkProvider
SecretsProvider · StorageProvider · BrowserProvider · ToolProvider
VerificationProvider · ObservabilityProvider · ProtectionProvider · DistributionProvider
```

Rules:

- Renaming or repurposing a published contract is forbidden; breaking changes require a version bump.
- Pull requests are a separate capability from repositories (`PullRequestProvider`), so a provider can implement one without the other.
- Providers declare which optional capabilities they implement; the kernel never assumes availability (capability resolution, spec section 48).

## Events

Typed events are the major extension point (spec section 7):

```text
workspace/* · repository/* · agent/* · tool/* · context/*
filesystem/* · runtime/* · verification/* · protection/*
```

Providers integrate through events, not by importing each other.

## Functionality Boundaries

A directory with an `AGENTS.md` is a functionality boundary. This repository's boundaries:

- `` (root) — the Workspace product: spec, kernel design, provider contracts.
- `docs/` — the published documentation set distilled from the spec.

When implementation packages land (kernel, `paw` CLI, providers), each becomes its own boundary with its own `AGENTS.md` (e.g. `packages/kernel/AGENTS.md`, `packages/cli/AGENTS.md`, `packages/provider-e2b/AGENTS.md`).

## Ecosystem Boundaries (fixed)

```text
PROAGENT      defines WHO the agent is
ACC           provides WHAT the agent understands
WORKSPACE     provides WHERE the agent works
Repo Shield   provides protection policy
reposell      provides distribution & licensing
```

The Workspace must work without ProAgents and without ACC — it is usable as a plain isolated coding environment for any agent.

## Truth & Authority

- `README.md` is authoritative for product behavior; `docs/` distills it.
- `AGENTS.md` contracts are authoritative for repository structure; memory (`.acc-memory.md`) is orientational knowledge, never authority.
- On conflict: spec > docs; contract > memory. The disagreement itself becomes a fix item.
