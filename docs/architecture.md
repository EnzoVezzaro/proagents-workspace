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