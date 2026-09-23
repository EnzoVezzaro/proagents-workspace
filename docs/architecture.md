# Architecture

## High-Level Architecture

```
                     PROAGENTS WORKSPACE

                          Kernel
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    Lifecycle           Services            Events
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
      Runtime           Repository          Context
         │                  │                  │
      Docker             GitHub              ACC
      E2B                GitLab              Git
      Local              Gitea               Custom
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
       Agent              Tools            Services
         │                  │                  │
      Codex               MCP              Browser
      Claude              Shell            Database
      OpenCode            Filesystem       Storage
      Gemini              Terminal         Secrets
```

## Kernel Responsibilities

The kernel remains intentionally small and owns:

- Configuration
- Plugin discovery
- Dependency resolution
- Lifecycle management
- Service registry
- Capability registry
- Event bus
- Workspace lifecycle
- Command registration
- Logging
- Health checks
- Permission framework
- Configuration resolution

**The kernel does not contain provider-specific business logic.**

## Service Registry

```typescript
interface ServiceRegistry {
  register<T>(
    definition: ServiceDefinition<T>,
    implementation: T
  ): void;

  get<T>(
    definition: ServiceDefinition<T>
  ): T;

  has(
    definition: ServiceDefinition<unknown>
  ): boolean;
}
```

Capabilities are discovered through service definitions:

```typescript
const repository = services.get(repositoryProvider);
```

Rather than direct instantiation:

```typescript
const github = new GitHubService(); // Avoid this
```

## Events

Typed events as major extension points:

```
workspace/creating      workspace/created
workspace/initializing  workspace/ready
workspace/starting      workspace/started
workspace/stopping      workspace/stopped
workspace/destroyed

repository/connecting   repository/cloning
repository/cloned       repository/changed

agent/starting          agent/started
agent/stopping          agent/stopped

command/before          command/after
tool/before             tool/after

context/indexing        context/indexed

filesystem/before-write filesystem/after-write

runtime/health          runtime/error

verification/started    verification/completed
```

## Capability Contracts

Define stable contracts for major capabilities:

```
RuntimeProvider
RepositoryProvider
ContextProvider
AgentProvider
FilesystemProvider
ShellProvider
TerminalProvider
NetworkProvider
SecretsProvider
StorageProvider
BrowserProvider
ToolProvider
VerificationProvider
ObservabilityProvider
```

These contracts are versioned.
## Plugin-First Architecture

Spec section 146 makes the plugin principle normative: **everything that can be replaced, extended, configured, or composed is a plugin**. The core owns plugin loading, the lifecycle engine, the event bus, permissions, persistence, and the workspace model — never hard-coded development behavior.

Practical rules that follow from it:

- Harnesses, agents, tools, lifecycle definitions, stages, gates, and integrations are plugins implementing the capability contracts (section 9).
- Plugins **declare** what they need and how they run — e.g. an agent plugin's manifest `runtime` descriptor carries its launch command — and consumers resolve those declarations generically from the plugin catalog. No agent-kind→binary tables, no `if (harness === "opencode")` switches anywhere in the core or product layers.
- The lifecycle engine composes plugin capabilities into an execution but stays the sole authority over sequencing, transitions, gates, retries, and policy (see [Development Lifecycle](lifecycle.md)).
- Default lifecycles and default plugin sets are **configuration data** — declarative and overridable per workspace — never compiled-in behavior.

Architectural test for every new capability: *can this be a plugin?* If it must be core infrastructure, the reason is documented in the spec; an undocumented exception is a violation, not a precedent.

### Lifecycle definitions and harness adapters as plugins

Both extension points use the declaration pattern of spec section 146:

- **Lifecycle plugins** (capability `lifecycle`) contribute named lifecycle definitions through the SDK's `definitions()` hook — pure data, validated against the same schema as `workspace.yaml` definitions. The host merges plugin contributions with configuration-file definitions and the built-in default (explicit configuration wins on id collision). A lifecycle plugin cannot execute anything or alter engine behavior; it only enlarges the library configuration can reference. Bundled: `lifecycle-web` (web-development), `lifecycle-security` (security-audit).
- **Harness adapter plugins** (capability `harness`, spec section 144) declare the same manifest `runtime` descriptor as agent plugins. The launchable-kind catalog merges both plugin families into one row per kind (adapter lists included) — the wizard and launch flows read descriptors, never provider switches.
