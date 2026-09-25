# ProAgents Workspace

🚧 **Work in Progress**

## The convention-first workspace for AI coding agents

ProAgents Workspace is a lightweight, convention-first workspace environment that makes existing AI coding agents work better inside a predictable, inspectable, convention-driven development environment.

It is NOT another agent, another IDE, or a mandatory cloud sandbox. It is the environment + conventions around an AI coding agent.

```bash
npm install -g @reposell/proagents-workspace

cd my-project
paw init        # makes the repository Workspace-aware (.paw/ only — source untouched)
paw status      # where am I, what is here, what is possible
paw verify      # runs detected lint/typecheck/test/build — no configuration needed
codex           # your existing agent keeps working
```

No runtime required. No cloud account required. No Docker, E2B, GitHub, ACC, ProAgents, or MCP required.

It is designed to work with:

* Codex
* Claude Code
* OpenCode
* Gemini CLI
* DeepSeek Harness
* custom agents
* other compatible agent runtimes

The Workspace itself does not define the agent's profession or intelligence.

It provides the environment in which the agent operates.

### Product direction: LIGHTWEIGHT FIRST, PROGRESSIVE SECOND

The product follows a progressive layering (spec section 148):

```text
Level 0  Zero configuration    paw            detect and explain
Level 1  Initialize            paw init       minimal .paw/ conventions
Level 2  Agent integration     paw agent list detected agents + tiers
Level 3  Verification          paw verify     inferred from project scripts
Level 4  Context               ACC etc.       optional context providers
Level 5  Lifecycle             paw lifecycle  programmable, inferred by default
Level 6  Isolation             paw workspace create --runtime docker|e2b
```

(Level 7, the desktop application, was retired in v0.3.0 — see spec section 145.)

Everything below Level 3 is OPTIONAL and invisible until it provides value. The default experience operates directly on the developer's current repository — the project is never cloned or moved. Isolated runtimes are a separate, explicit mode (spec section 148: "Workspace" = the developer/project environment by default; "isolated/runtime workspace" = the heavier sandboxed mode). There is no desktop application: the terminal is the interface.

---

# 1. Product Model

The ProAgents ecosystem should have clear boundaries:

```text
PROAGENT
    │
    │ defines
    ▼
WHO the agent is

ACC
    │
    │ provides
    ▼
WHAT the agent understands

PROAGENTS WORKSPACE
    │
    │ provides
    ▼
WHERE the agent works
```

Together:

```text
Professional Agent
        +
Agent Context
        +
Agent Workspace
        =
Professional AI Development Environment
```

ProAgents Workspace must also work without ProAgents.

ACC must also be optional.

A user should be able to use Workspace simply as an isolated coding environment for another agent.

---

## Development Lifecycle Loop

The key change is that **verification should not be a single final step**. The Workspace should support a programmable, extensible **development lifecycle loop** where additional validation stages can be inserted depending on the project, agent, risk level, or Workspace profile.

```text
┌─────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT LIFECYCLE                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │  Define Goal   │
                     └───────┬────────┘
                             ▼
                     ┌────────────────┐
                     │ Inspect / Plan │
                     └───────┬────────┘
                             ▼
                     ┌────────────────┐
                     │    Implement   │
                     └───────┬────────┘
                             ▼
                ┌──────────────────────────┐
                │      Development         │
                │        Checks             │
                └────────────┬─────────────┘
                             ▼
                  ┌─────────────────────┐
                  │ Unit / Integration  │
                  │       Testing       │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │   Static Analysis   │
                  │ Lint / Type / SAST  │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │       Build         │
                  └──────────┬──────────┘
                             ▼
              ┌──────────────────────────────┐
              │       Runtime Testing        │
              │                              │
              │ Real browser engine          │
              │ Real platform environment    │
              │ Device/API behavior           │
              │ Integration services          │
              └──────────────┬───────────────┘
                             ▼
                  ┌─────────────────────┐
                  │   Audience Tests    │
                  │   A/B Experiments   │
                  │   UX Validation     │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │   Real-World Test   │
                  │     / Preview       │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │     Evaluation      │
                  │ Aggregate Results   │
                  └──────────┬──────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                  FAIL               PASS
                    │                 │
                    ▼                 ▼
             ┌─────────────┐   ┌──────────────┐
             │ Diagnose /   │   │   Snapshot   │
             │ Fix Changes  │   └──────┬───────┘
             └──────┬──────┘          ▼
                    │          ┌──────────────┐
                    │          │ Final Verify │
                    │          └──────┬───────┘
                    │                 ▼
                    │          ┌──────────────┐
                    │          │ Commit / PR  │
                    │          └──────┬───────┘
                    │                 ▼
                    │          ┌──────────────┐
                    │          │   Monitor    │
                    │          │ / Feedback   │
                    │          └──────┬───────┘
                    │                 │
                    └─────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ IMPROVEMENT LOOP │
                     └────────┬────────┘
                              │
                              └──────────► Implement
```

### Lifecycle Steps

The important abstraction is a **Step**, not a hard-coded verification pipeline.

```text
Lifecycle
    │
    ├── Plan
    ├── Implement
    ├── Test
    ├── Analyze
    ├── Build
    ├── Browser Test
    ├── Platform Test
    ├── Device Test
    ├── Performance Test
    ├── Security Test
    ├── Accessibility Test
    ├── Audience Test
    ├── A/B Test
    ├── Real-World Test
    ├── Evaluate
    ├── Fix
    ├── Re-test
    ├── Snapshot
    ├── Commit
    └── Deploy / PR
```

Each step should be independently composable:

```text
                 DEVELOPMENT LIFECYCLE
                         │
                         ▼
              ┌──────────────────────┐
              │    Step Registry     │
              └──────────┬───────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      Test Step      Browser Step    Security Step
          │              │              │
          ▼              ▼              ▼
       Vitest         Chromium       Semgrep
       Playwright     Firefox        SAST
       Custom         Safari         Dependency
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Step Result
                         │
                         ▼
                   Evaluation
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
             FAIL                  PASS
              │                     │
              ▼                     ▼
             Fix                Next Step
              │                     │
              └───────► Loop ◄──────┘
```

### Programmable Lifecycle

A Workspace profile could define its own lifecycle:

```yaml
lifecycle:
  steps:

    - id: unit-tests
      type: test

    - id: integration-tests
      type: test

    - id: browser-chromium
      type: browser-test
      engine: chromium

    - id: browser-firefox
      type: browser-test
      engine: firefox

    - id: browser-webkit
      type: browser-test
      engine: webkit

    - id: platform-test
      type: platform-test

    - id: performance
      type: performance-test

    - id: security
      type: security-test

    - id: accessibility
      type: accessibility-test

    - id: audience-test
      type: audience-test

    - id: ab-test
      type: experiment

    - id: real-world
      type: real-world-test

    - id: final-verification
      type: verification
```

The critical idea is that **the lifecycle itself becomes programmable**.

An agent can therefore move from:

```text
write code
   ↓
run tests
   ↓
done
```

to:

```text
write
 ↓
test
 ↓
build
 ↓
run in real browser
 ↓
run against target platform
 ↓
test real integrations
 ↓
test performance
 ↓
test security
 ↓
test accessibility
 ↓
test with representative audience
 ↓
run experiment
 ↓
observe real-world behavior
 ↓
analyze
 ↓
fix
 ↓
repeat
 ↓
verify
 ↓
ship
```

And different projects can define different loops:

```text
                    Workspace
                        │
             ┌──────────┴──────────┐
             │   Lifecycle Engine  │
             └──────────┬──────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   Web App          API Service       AI Agent
       │                │                │
 Browser tests      API tests        Agent evals
 Platform tests     Load tests       Model tests
 UX tests           Security         Tool tests
 A/B tests          Contract tests    Real-world
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                    Evaluation
                        │
                        ▼
                       Loop
```

This makes the Workspace more than an environment that **runs tests**: it becomes an environment that can **execute an entire programmable development-and-validation lifecycle**.

---

# 2. Primary Product Goal

The primary goal is to make this workflow extremely simple:

```text
Choose repository
        ↓
Create workspace
        ↓
Prepare environment
        ↓
Connect agent
        ↓
Agent works
        ↓
Inspect changes
        ↓
Run verification
        ↓
Persist / snapshot
        ↓
Commit / push / PR
```

The entire process should be reproducible.

An agent should be able to enter a Workspace and immediately have access to the project it needs to work on.

---

# 3. Example

A developer should be able to do something like:

```bash
paw workspace create
```

or:

```bash
paw workspace create \
  --repo github:acme/my-project \
  --branch feature/auth
```

Then:

```text
Creating workspace...

✓ Runtime selected
✓ Workspace created
✓ Repository connected
✓ Repository cloned
✓ Project detected
✓ Dependencies prepared
✓ Context provider initialized
✓ Agent connected

Workspace ready.

Path:
  /workspace/repo

Repository:
  acme/my-project

Branch:
  feature/auth

Agent:
  codex

Context:
  acc
```

The developer can then launch or attach an agent:

```bash
paw agent start codex
```

The agent works inside:

```text
/workspace/repo
```

It can:

* inspect files
* search code
* modify files
* execute commands
* install dependencies
* run tests
* run builds
* start services
* inspect logs
* use configured tools
* use context providers
* create commits
* push branches
* create pull requests

---

# 4. Design Principles

## 4.1 Agent-first

The primary consumer is an AI agent.

Human developers should also be able to inspect and control the Workspace.

The APIs and CLI must therefore support both:

```text
Agent
  ↓
Workspace API
```

and:

```text
Developer
  ↓
CLI
  ↓
Workspace API
```

---

## 4.2 Runtime-neutral

The Workspace must not depend on one sandbox provider.

Support a common runtime contract.

Possible implementations:

```text
local
docker
e2b
kubernetes
firecracker
daytona
remote-vm
custom
```

The implementation used should be selectable through configuration.

---

## 4.3 Repository-neutral

GitHub should be a first-class official integration, but the Workspace must not depend on GitHub.

Support a common repository contract.

Potential providers:

```text
GitHub
GitLab
Bitbucket
Gitea
Forgejo
Azure DevOps
generic Git
local repositories
```

---

## 4.4 Context-neutral

ACC should be the official context integration for ProAgents, but Workspace should not depend on ACC.

Support a common context contract.

Possible providers:

```text
ACC
filesystem context
Git context
language-server context
tree-sitter context
custom context
```

---

## 4.5 Agent-neutral

The Workspace must not require a particular coding agent.

Agents should connect through adapters.

Possible integrations:

```text
Claude Code
Codex
OpenCode
Gemini CLI
DeepSeek Harness
custom CLI agents
ACP-compatible agents
MCP-based agents
```

---

## 4.6 Reproducible

A Workspace should be reconstructable from its configuration.

A Workspace definition should capture:

```text
runtime
repository
branch
commit
environment
dependencies
services
context providers
agent configuration
tools
network policy
permissions
secrets references
workspace state
```

A Workspace should be exportable.

Example:

```bash
paw workspace export ws_123
```

producing:

```text
workspace.yaml
```

Another machine should be able to recreate it:

```bash
paw workspace create --from workspace.yaml
```

---

# 5. Architecture

The architecture should have a small kernel and capability contracts around it.

```text
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

The kernel owns composition and lifecycle.

Concrete providers implement contracts.

---

# 6. Kernel Responsibilities

The kernel should remain intentionally small.

It owns:

* configuration
* plugin discovery
* dependency resolution
* lifecycle management
* service registry
* capability registry
* event bus
* workspace lifecycle
* command registration
* logging
* health checks
* permission framework
* configuration resolution

It should not contain provider-specific business logic.

---

# 7. Service Registry

Create a typed service registry.

Conceptually:

```ts
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

Capabilities should be discovered through service definitions.

Example:

```ts
const repository = services.get(repositoryProvider);
```

rather than:

```ts
const github = new GitHubService();
```

This ensures provider replacement does not require changes to consumers.

---

# 8. Events

Use typed events as major extension points.

Examples:

```text
workspace/creating
workspace/created
workspace/initializing
workspace/ready
workspace/starting
workspace/started
workspace/stopping
workspace/stopped
workspace/destroyed

repository/connecting
repository/cloning
repository/cloned
repository/changed

agent/starting
agent/started
agent/stopping
agent/stopped

command/before
command/after

tool/before
tool/after

context/indexing
context/indexed

filesystem/before-write
filesystem/after-write

runtime/health
runtime/error

verification/started
verification/completed
```

Events should allow integrations to observe and react to Workspace activity without modifying the execution engine.

---

# 9. Capability Contracts

Define stable contracts for the major capabilities.

At minimum:

```text
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

These contracts should be versioned.

---

# 10. Runtime Provider

The runtime is the computer underneath the Workspace.

```ts
interface RuntimeProvider {
  create(
    config: RuntimeConfig
  ): Promise<RuntimeInstance>;

  start(
    id: string
  ): Promise<void>;

  stop(
    id: string
  ): Promise<void>;

  destroy(
    id: string
  ): Promise<void>;

  exec(
    id: string,
    request: ExecRequest
  ): Promise<ExecResult>;

  getFilesystem(
    id: string
  ): Promise<FilesystemHandle>;

  getNetwork(
    id: string
  ): Promise<NetworkHandle>;

  snapshot?(
    id: string,
    options?: SnapshotOptions
  ): Promise<Snapshot>;

  restore?(
    snapshot: Snapshot
  ): Promise<RuntimeInstance>;

  inspect(
    id: string
  ): Promise<RuntimeInspection>;
}
```

---

# 11. Runtime Implementations

The initial implementation should provide:

```text
Local
Docker
E2B
```

Additional providers can follow:

```text
Kubernetes
Firecracker
Daytona
remote VM
custom infrastructure
```

The runtime selection should be configuration-driven.

Example:

```yaml
runtime:
  provider: e2b
```

or:

```yaml
runtime:
  provider: docker
```

or:

```yaml
runtime:
  provider: local
```

---

# 12. E2B Integration

E2B should be provided as an official runtime implementation.

The integration should support:

* workspace creation
* command execution
* filesystem access
* environment variables
* networking
* package installation
* long-running processes
* snapshots where supported
* lifecycle management
* resource configuration

The E2B SDK must remain behind the runtime contract.

The rest of Workspace must not import E2B directly.

---

# 13. Local Runtime

The local runtime allows developers to use their own machine.

Example:

```bash
paw workspace create --runtime local
```

It should expose:

```text
filesystem
shell
terminal
Git
processes
network
ports
environment
```

The CLI must clearly report the security model.

For example:

```text
Runtime: local
Isolation: host-level
Network: unrestricted
```

Do not present local execution as equivalent to a sandbox.

---

# 14. Docker Runtime

Docker provides a local isolated execution option.

Support:

```text
CPU limits
memory limits
disk limits
environment variables
volumes
ports
network policy
process lifecycle
image selection
```

Example:

```bash
paw workspace create \
  --runtime docker \
  --image node:22
```

---

# 15. Workspace Filesystem

A Workspace should have a predictable structure.

Recommended:

```text
/workspace
├── repo/
├── context/
├── artifacts/
├── logs/
├── tmp/
└── .proagents/
```

The repository should normally live at:

```text
/workspace/repo
```

Workspace metadata should live separately from user code.

Do not pollute the repository with Workspace implementation files unless explicitly configured.

---

# 16. Repository Provider

Define:

```ts
interface RepositoryProvider {
  listRepositories(
    options?: RepositoryListOptions
  ): Promise<Repository[]>;

  getRepository(
    reference: RepositoryReference
  ): Promise<Repository>;

  clone(
    reference: RepositoryReference,
    destination: string,
    options?: CloneOptions
  ): Promise<CloneResult>;

  fetch(
    repository: LocalRepository
  ): Promise<void>;

  checkout(
    repository: LocalRepository,
    reference: GitReference
  ): Promise<void>;

  createBranch(
    repository: LocalRepository,
    branch: string
  ): Promise<void>;

  push(
    repository: LocalRepository,
    options: PushOptions
  ): Promise<void>;
}
```

Pull requests should be a separate capability where appropriate:

```ts
interface PullRequestProvider {
  create(request: PullRequestRequest): Promise<PullRequest>;

  update(
    id: string,
    request: PullRequestUpdate
  ): Promise<PullRequest>;

  list(
    repository: RepositoryReference
  ): Promise<PullRequest[]>;
}
```

---

# 17. GitHub Integration

Ship an official GitHub provider.

The user flow should be:

```bash
paw github connect
```

Then the provider handles authentication and repository selection.

A Workspace configuration might contain:

```yaml
repository:
  provider: github
  repository: acme/project
  branch: feature/auth
```

The kernel does not know what GitHub is.

The GitHub provider translates the generic repository contract into GitHub operations.

Authentication should use a secure mechanism such as a GitHub App where appropriate.

Never store long-lived credentials inside a Workspace image.

Credentials should be injected dynamically.

---

# 18. Repository Initialization

When creating a Workspace from a repository:

```text
Create runtime
       ↓
Prepare filesystem
       ↓
Authenticate repository provider
       ↓
Clone repository
       ↓
Checkout requested branch/commit
       ↓
Detect project
       ↓
Prepare dependencies
       ↓
Initialize context providers
       ↓
Workspace READY
```

The process should be observable.

Example:

```text
✓ Runtime
✓ Repository authentication
✓ Clone
✓ Branch checkout
✓ Project detection
✓ Dependency detection
✓ Context initialization
✓ Workspace ready
```

---

# 19. Project Detection

The Workspace should inspect the repository and determine the development environment.

Examples:

```text
package.json        → Node.js
pnpm-lock.yaml      → pnpm
yarn.lock           → Yarn
bun.lock            → Bun
Cargo.toml          → Rust
go.mod              → Go
pyproject.toml      → Python
requirements.txt    → Python
pom.xml             → Java
build.gradle        → Java/Kotlin
Gemfile             → Ruby
composer.json       → PHP
Makefile            → generic build
Dockerfile          → containerized project
```

Detection should produce a project profile.

Example:

```json
{
  "language": ["typescript"],
  "runtime": "node",
  "packageManager": "pnpm",
  "framework": ["nextjs"],
  "test": "vitest",
  "build": "next build"
}
```

Do not blindly execute arbitrary install scripts without applying Workspace security policy.

---

# 20. Context Provider

Define:

```ts
interface ContextProvider {
  initialize(
    workspace: Workspace
  ): Promise<void>;

  index(
    request: ContextIndexRequest
  ): Promise<ContextIndex>;

  query(
    request: ContextQuery
  ): Promise<ContextResult>;

  status(): Promise<ContextStatus>;
}
```

Optional capabilities:

```ts
getSymbol()
getDependencies()
getArchitecture()
getImpact()
getReferences()
getCallGraph()
getGitHistory()
```

---

# 21. ACC Integration

Ship an official ACC provider.

ACC should automatically initialize when installed and enabled.

Example:

```yaml
context:
  providers:
    - acc
```

The ACC provider should index the repository and expose its understanding through the generic ContextProvider contract.

The agent should be able to ask:

```text
What depends on this module?
Where is this function used?
What files are affected?
What is the architecture of this package?
Where is authentication implemented?
```

without the Workspace itself needing to understand ACC's internal implementation.

---

# 22. Context Lifecycle

Context initialization:

```text
Repository ready
      ↓
Context provider initialized
      ↓
Repository scan
      ↓
Index generation
      ↓
Context ready
```

Expose:

```bash
paw context status
paw context rebuild
paw context query
paw context inspect
```

---

# 23. Agent Provider

Agents connect through a common interface.

```ts
interface AgentProvider {
  detect(): Promise<boolean>;

  start(
    workspace: Workspace,
    options: AgentStartOptions
  ): Promise<AgentSession>;

  stop(
    sessionId: string
  ): Promise<void>;

  status(
    sessionId: string
  ): Promise<AgentStatus>;
}
```

Official integrations should eventually include:

```text
Claude Code
Codex
OpenCode
Gemini CLI
DeepSeek Harness
```

---

# 24. ProAgents Integration

Provide an official ProAgents provider.

It should accept a ProAgent profile and configure the Workspace accordingly.

Example:

```yaml
agent:
  provider: proagent

  profile:
    source: ./software-engineer.agent.yaml
```

The ProAgent profile may request:

```text
runtime capabilities
context capabilities
tools
MCP servers
filesystem permissions
network permissions
verification
skills
environment variables
```

Workspace resolves those requirements.

---

# 25. Agent Workspace Contract

A ProAgent should be able to ask Workspace for:

```text
filesystem
shell
terminal
Git
repository
context
network
browser
MCP
secrets
services
verification
```

The agent should not need to know which underlying implementation provides them.

---

# 26. Shell

Define:

```ts
interface ShellProvider {
  exec(
    request: ShellRequest
  ): Promise<ShellResult>;
}
```

Support:

```text
working directory
environment
timeout
stdin
stdout
stderr
exit code
signals
resource limits
```

Example:

```bash
paw exec -- npm test
```

---

# 27. Persistent Terminal

Provide persistent terminal sessions.

```ts
interface TerminalProvider {
  create(): Promise<TerminalSession>;

  write(
    id: string,
    input: string
  ): Promise<void>;

  resize(
    id: string,
    cols: number,
    rows: number
  ): Promise<void>;

  output(
    id: string
  ): AsyncIterable<TerminalOutput>;

  close(
    id: string
  ): Promise<void>;
}
```

This is important for development servers and long-running processes.

---

# 28. Services

A Workspace must support project services.

Examples:

```text
PostgreSQL
Redis
MySQL
MongoDB
LocalStack
development servers
background workers
queues
```

Define:

```ts
interface ServiceProvider {
  start(service: ServiceConfig): Promise<ServiceInstance>;

  stop(id: string): Promise<void>;

  status(id: string): Promise<ServiceStatus>;

  logs(id: string): AsyncIterable<LogLine>;
}
```

Services should be declarative.

Example:

```yaml
services:
  postgres:
    image: postgres:18

  redis:
    image: redis:8
```

---

# 29. Network

Networking must be explicit.

Define:

```ts
interface NetworkProvider {
  allow(request: NetworkRule): Promise<void>;

  deny(request: NetworkRule): Promise<void>;

  inspect(): Promise<NetworkPolicy>;
}
```

Workspace configurations should support:

```yaml
network:
  mode: restricted

  allow:
    - registry.npmjs.org
    - github.com
    - api.example.com
```

Support:

```text
allowlist
denylist
offline
restricted
unrestricted
```

The security model must be visible to the user.

---

# 30. Secrets

Never place secrets directly into source code or Workspace configuration files.

Define:

```ts
interface SecretsProvider {
  resolve(
    reference: SecretReference
  ): Promise<SecretValue>;

  inject(
    workspace: Workspace,
    references: SecretReference[]
  ): Promise<void>;
}
```

Possible providers:

```text
environment
local keychain
1Password
Vault
AWS Secrets Manager
GCP Secret Manager
Azure Key Vault
custom
```

Secrets should preferably be injected at runtime.

---

# 31. MCP

MCP should be an integration layer rather than a hard-coded feature.

A Workspace may expose MCP servers to an agent.

Example:

```yaml
mcp:
  servers:
    - name: browser
      provider: browser-mcp

    - name: database
      provider: postgres-mcp
```

MCP credentials and permissions must be governed by Workspace policy.

---

# 32. Browser

Browser access should be optional.

Define:

```ts
interface BrowserProvider {
  launch(): Promise<BrowserSession>;

  navigate(
    session: string,
    url: string
  ): Promise<void>;

  screenshot(
    session: string
  ): Promise<Buffer>;

  close(
    session: string
  ): Promise<void>;
}
```

Possible implementations:

```text
Playwright
Chromium
Browserbase
E2B browser
custom
```

---

# 33. Workspace Security

Security is a core product requirement.

The Workspace must explicitly control:

```text
filesystem
processes
network
credentials
MCP
browser
ports
services
repository writes
Git operations
external APIs
```

Permissions should be declarative.

Example:

```yaml
permissions:

  filesystem:
    read:
      - /workspace/repo

    write:
      - /workspace/repo

  network:
    mode: restricted

  git:
    commit: true
    push: true

  repository:
    pull_request: true

  secrets:
    allowed:
      - npm_token
```

---

# 34. Approval Policies

Support different modes.

### Autonomous

```yaml
approval:
  mode: autonomous
```

### Confirm dangerous actions

```yaml
approval:
  mode: guarded
```

### Human-controlled

```yaml
approval:
  mode: manual
```

Dangerous operations may include:

```text
destructive filesystem operations
credential access
network changes
force push
repository deletion
production deployments
```

---

# 35. Git Safety

Never allow an agent to accidentally destroy repository history.

Provide policies for:

```text
force push
branch deletion
reset --hard
clean -fd
tag deletion
remote changes
```

Default behavior should be conservative.

---

# 36. Verification

Verification should be a first-class capability.

Define:

```ts
interface VerificationProvider {
  run(
    request: VerificationRequest
  ): Promise<VerificationResult>;
}
```

Verification can execute:

```text
lint
typecheck
unit tests
integration tests
build
security scans
custom commands
```

Example:

```yaml
verification:
  commands:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build
```

---

# 37. Change Verification

After an agent modifies code:

```text
Agent changes
      ↓
Git diff
      ↓
Affected files
      ↓
Context impact analysis
      ↓
Tests
      ↓
Build
      ↓
Verification
      ↓
Result
```

If ACC is available, Workspace should use it to improve impact-aware verification.

For example:

```text
Changed:
src/auth/session.ts

ACC:
12 dependent modules

Verification:
auth tests
session tests
API tests
```

---

# 38. Git Workflow

The default coding workflow should support:

```text
clone
checkout
branch
edit
test
diff
commit
push
pull request
```

Example:

```bash
paw git status
paw git diff
paw git branch create feature/auth
paw git commit
paw git push
paw pr create
```

The actual repository provider handles remote operations.

---

# 39. Pull Requests

A Pull Request provider can expose:

```bash
paw pr create
```

The Workspace can automatically collect:

```text
branch
commits
diff
verification results
test results
context impact
agent summary
```

and generate a structured PR description.

Example:

```text
Summary
-------

Implemented session expiration handling.

Changes
-------

- Added session expiration validation
- Added refresh token handling
- Added tests

Verification
------------

✓ Unit tests
✓ Typecheck
✓ Build

Context Impact
--------------

12 dependent modules analyzed
```

---

# 40. Workspace State

Maintain Workspace state separately from repository state.

Workspace state includes:

```text
workspace ID
runtime
runtime state
repository
branch
commit
agent sessions
context providers
services
network policy
permissions
secrets references
snapshots
verification history
```

---

# 41. Sessions

A Workspace may have multiple agent sessions.

Example:

```text
Workspace
│
├── Agent Session: implementation
├── Agent Session: tests
├── Agent Session: review
└── Agent Session: security
```

Each session should have:

```text
id
agent
start time
end time
status
workspace
events
logs
artifacts
```

Sessions should be resumable where the underlying agent supports it.

---

# 42. Observability

Everything important should be observable.

Expose:

```text
workspace events
runtime events
agent events
shell executions
tool executions
network activity
Git operations
verification
errors
resource usage
```

Example:

```bash
paw workspace logs
paw workspace events
paw workspace inspect
paw agent logs
```

---

# 43. Traceability

A Workspace should be able to answer:

```text
What did the agent do?

Which files changed?

Which commands were executed?

Which tools were called?

Which tests ran?

Which external services were contacted?

Which Git operations happened?

Which verification checks passed?

What context did the agent receive?
```

When the underlying agent provides a trace/session mechanism, integrate with it rather than duplicating it.

---

# 44. Artifacts

Workspace artifacts should be first-class.

Examples:

```text
build output
test reports
coverage
screenshots
logs
patches
generated files
analysis reports
verification reports
```

Define:

```ts
interface ArtifactStore {
  put(
    artifact: Artifact
  ): Promise<ArtifactReference>;

  get(
    reference: ArtifactReference
  ): Promise<Artifact>;

  list(
    workspaceId: string
  ): Promise<ArtifactReference[]>;
}
```

---

# 45. Snapshots

Where supported, a Workspace can be snapshotted.

Snapshots should capture:

```text
runtime state
filesystem
environment configuration
installed dependencies
services
context state where possible
```

Example:

```bash
paw workspace snapshot create
```

Restore:

```bash
paw workspace snapshot restore snap_123
```

Snapshots should be runtime-provider-specific internally but exposed through a common abstraction.

---

# 46. Workspace Profiles

Create reusable Workspace profiles.

Example:

```yaml
name: typescript-development

runtime:
  provider: docker
  image: node:22

repository:
  provider: github

context:
  providers:
    - acc

services:
  - postgres

network:
  mode: restricted

verification:
  commands:
    - pnpm lint
    - pnpm test
    - pnpm build
```

Profiles should be composable.

---

# 47. ProAgents Profiles

A ProAgent profile should be able to reference a Workspace profile.

Example:

```yaml
agent:
  profile: senior-software-engineer

workspace:
  profile: typescript-development
```

Or a ProAgent can declare workspace requirements:

```yaml
workspace:
  requirements:

    runtime:
      node: ">=22"

    services:
      - postgres

    context:
      - acc

    capabilities:
      - shell
      - filesystem
      - git
```

Workspace resolves these requirements.

---

# 48. Capability Resolution

When an agent requests a capability:

```text
Agent requests:
    browser
```

Workspace resolves:

```text
browser capability
        ↓
available provider?
        ↓
yes
        ↓
start provider
        ↓
apply policy
        ↓
return capability
```

If unavailable:

```text
Capability unavailable.

Required:
  browser

Available alternatives:
  none

Possible providers:
  playwright
  browserbase
```

Never silently provide a weaker capability.

---

# 49. Dependency Resolution

Plugins/providers can declare dependencies.

Example:

```yaml
plugin:
  id: acc

requires:
  - filesystem
  - git
```

Workspace resolves:

```text
ACC
 ↓
Filesystem
 ↓
Runtime
```

If dependency resolution fails, report it clearly.

---

# 50. CLI

The CLI is the primary interface: a normal developer CLI, not a platform console. The developer-facing surface leads with the convention-first commands; infrastructure commands exist when needed but are never forced into every command.

Command structure:

```text
paw
├── init              (convention-first: make this repository Workspace-aware)
├── status            (convention-first: where am I / what is here)
├── research          (convention-first: product/environment discovery, section 149)
├── doctor            (convention-first: diagnostics; optional ≠ failure)
├── verify            (convention-first: run detected/configured checks)
├── diff              (convention-first: git working-tree diff)
├── agent
├── workspace
├── runtime
├── repository
├── context
├── plugin
├── git
├── pr
├── exec
├── shell
├── terminal
├── service
├── secret
├── snapshot
├── logs
└── config
```

Ergonomic rule: `paw verify`, `paw diff`, `paw status` operate on the current repository — NOT `paw workspace verify`/`paw workspace diff`. The `workspace` noun is reserved for isolated workspaces (section 148).

---

# 51. Workspace Commands

```bash
paw workspace create
paw workspace list
paw workspace get <id>
paw workspace start <id>
paw workspace stop <id>
paw workspace restart <id>
paw workspace destroy <id>
paw workspace inspect <id>
paw workspace logs <id>
paw workspace export <id>
```

---

# 52. Repository Commands

```bash
paw repository list
paw repository connect
paw repository clone
paw repository status
paw repository fetch
paw repository checkout
```

---

# 53. Agent Commands

```bash
paw agent list
paw agent detect
paw agent start
paw agent stop
paw agent status
paw agent attach
```

`paw agent list` reports DETECTED agents with their honest integration tier (detect/environment/process/native — section 148); detection is capability-based over declared integration probes, never a hard-coded agent table in the kernel.

Example:

```bash
paw agent start codex
```

---

# 54. Context Commands

```bash
paw context list
paw context status
paw context initialize
paw context index
paw context rebuild
paw context query
```

ACC becomes available through these commands when the ACC provider is installed.

---

# 55. Verification Commands

```bash
paw verify
paw verify test
paw verify build
paw verify lint
paw verify typecheck
```

Verification is NATIVE and inferred by default (spec section 18): with no configured commands, `paw verify` discovers project checks from existing conventions (package scripts, manifests) in the order lint → typecheck → test → build, and runs them. Configured commands in `.paw/workspace.yaml` always win over inference. Results are machine-readable with `--json`.

---

# 56. Configuration

Use a declarative configuration format.

Support:

```yaml
workspace:
  name: my-project

runtime:
  provider: e2b

repository:
  provider: github
  repository: acme/project
  branch: feature/auth

context:
  providers:
    - acc

agent:
  provider: codex

network:
  mode: restricted

verification:
  commands:
    - pnpm test
    - pnpm build
```

Configuration should support:

```text
defaults
profiles
workspace overrides
environment overrides
CLI overrides
```

---

# 57. Profiles and Bundles

Support reusable compositions.

A profile describes a complete Workspace configuration.

Example:

```text
profiles/
├── software-engineer
├── frontend
├── backend
├── security
├── data
└── minimal
```

A profile may compose:

```text
runtime
repository
context
agent
tools
verification
security
```

Profiles should be inspectable.

Example:

```bash
paw profile inspect software-engineer
```

---

# 58. Plugin Packaging

Plugins should be independently installable.

Example:

```bash
paw plugin install github
paw plugin install acc
paw plugin install e2b
paw plugin install docker
paw plugin install codex
```

Plugin metadata should include:

```json
{
  "name": "@proagents/plugin-github",
  "version": "1.0.0",
  "capabilities": [
    "repository",
    "pull-request"
  ],
  "requires": [],
  "permissions": [
    "network"
  ]
}
```

---

# 59. Plugin Manifest

Every plugin should expose machine-readable metadata.

Required:

```text
id
name
version
description
capabilities
dependencies
configuration
permissions
compatibility
runtime requirements
license
integrity
```

Optional:

```text
documentation
examples
health checks
upgrade policy
migration information
```

---

# 60. Plugin Lifecycle

Plugin lifecycle:

```text
discover
    ↓
resolve dependencies
    ↓
validate
    ↓
load
    ↓
initialize
    ↓
register services
    ↓
register events
    ↓
start
    ↓
running
    ↓
stop
    ↓
dispose
```

Lifecycle failures must unwind cleanly.

---

# 61. Plugin Isolation

A faulty optional plugin should not crash unrelated Workspace capabilities where practical.

For example:

```text
ACC plugin fails
      ↓
Workspace remains available
      ↓
Context capability marked unavailable
```

rather than:

```text
ACC failure
      ↓
entire Workspace crashes
```

Critical dependencies should still fail fast when required.

---

# 62. Provider Health

Every provider should expose health.

Example:

```bash
paw doctor
```

Output:

```text
ProAgents Workspace Doctor

Runtime
  ✓ E2B

Repository
  ✓ GitHub

Context
  ✓ ACC

Agent
  ✓ Codex

Filesystem
  ✓ Ready

Network
  ✓ Restricted

Secrets
  ✓ Available

Verification
  ✓ Configured
```

---

# 63. `paw doctor`

The doctor command should diagnose:

```text
runtime connectivity
provider installation
credentials
repository access
Git
filesystem
network
context indexing
agent availability
MCP
services
resource limits
```

It should provide actionable errors.

---

# 64. API

The CLI should use the same underlying Workspace API.

Expose a programmatic SDK:

```ts
import { Workspace } from "@proagents/workspace";

const workspace = await Workspace.create({
  runtime: "e2b"
});

await workspace.repository.clone(...);

await workspace.agent.start(...);

await workspace.verify();
```

The SDK must not duplicate the CLI implementation.

CLI and SDK should call the same services.

---

# 65. Remote API

Eventually support a Workspace server.

Architecture:

```text
CLI
SDK
Agent
Web UI
CI/CD
       │
       ▼
Workspace API
       │
       ▼
Workspace Runtime
```

The API should be optional for local operation.

---

# 66. Web UI

A UI is optional and should sit above the Workspace API.

It should expose:

```text
Workspace list
Workspace status
Repository
Agent session
Terminal
Filesystem
Git diff
Logs
Services
Context
Verification
Artifacts
```

Do not make the Web UI a requirement for the core product.

---

# 67. Workspace Dashboard

A Workspace dashboard should show:

```text
Project
Repository
Branch
Commit
Runtime
Agent
Context
Services
Network
Verification
Resource usage
```

And live:

```text
agent activity
terminal
logs
diff
test output
```

---

# 68. Git Diff Interface

Expose the current change set.

```text
Changed files
Added
Modified
Deleted
Renamed
```

For every file:

```text
before
after
diff
```

The Workspace API should expose this independently of the UI.

---

# 69. Agent-to-Workspace Communication

The agent should have access to Workspace capabilities through:

```text
CLI
SDK
MCP
ACP
environment variables
filesystem
agent-specific adapters
```

Do not require every agent to implement a ProAgents-specific protocol.

Provide adapters.

---

# 70. MCP Adapter

Workspace should optionally expose its capabilities through MCP.

For example:

```text
workspace.exec
workspace.read_file
workspace.write_file
workspace.search
workspace.git_diff
workspace.test
workspace.verify
workspace.inspect
```

MCP should be generated from Workspace service definitions where possible.

---

# 71. ACP Adapter

Support ACP-compatible agents where useful.

The ACP layer should map:

```text
Agent
    ↓
ACP
    ↓
Workspace
```

without changing Workspace internals.

---

# 72. Agent Environment Variables

Provide standardized environment variables.

Examples:

```text
PROAGENTS_WORKSPACE_ID
PROAGENTS_WORKSPACE_ROOT
PROAGENTS_REPOSITORY
PROAGENTS_BRANCH
PROAGENTS_RUNTIME
PROAGENTS_CONTEXT_PROVIDER
```

Do not expose secrets through environment variables unless explicitly requested.

---

# 73. Workspace Metadata

Create:

```text
/workspace/.proagents/
```

containing runtime metadata that does not belong in the repository.

For example:

```text
.proagents/
├── workspace.json
├── state.json
├── providers.json
├── sessions/
├── artifacts/
└── logs/
```

Do not commit this directory into the user's repository by default.

---

# 74. Repository Independence

The Workspace should never require changes to the target repository.

It should work with:

```text
existing repositories
legacy repositories
monorepos
polyrepos
private repositories
public repositories
repositories without ProAgents
repositories without ACC
```

---

# 75. Monorepos

Support:

```text
Turborepo
Nx
pnpm workspaces
npm workspaces
Yarn workspaces
Bazel
Cargo workspaces
Gradle multi-project
custom monorepos
```

ACC and project detection should understand monorepo boundaries where possible.

---

# 76. Multiple Repositories

A Workspace may contain multiple repositories.

Example:

```yaml
repositories:

  frontend:
    provider: github
    repository: acme/frontend

  backend:
    provider: github
    repository: acme/backend
```

Workspace:

```text
/workspace
├── frontend
└── backend
```

Agents can work across repositories if permissions allow it.

---

# 77. Multi-Agent Workspaces

A Workspace can support multiple agents.

Example:

```text
Workspace
│
├── implementation agent
├── testing agent
├── review agent
└── security agent
```

Agents may share the same filesystem or use isolated worktrees.

Support:

```text
shared workspace
isolated worktree
isolated workspace
```

---

# 78. Git Worktrees

Git worktrees should be supported for parallel agent work.

Example:

```text
/workspace/repo
/workspace/worktrees/agent-1
/workspace/worktrees/agent-2
/workspace/worktrees/reviewer
```

This enables multiple agents to work concurrently without corrupting each other's branch state.

---

# 79. Parallel Work

Workspace should eventually support:

```text
Agent A → feature
Agent B → tests
Agent C → review
```

with controlled synchronization.

A coordinator can inspect:

```text
branches
diffs
tests
conflicts
```

before merging changes.

---

# 80. Conflict Handling

When branches conflict:

```text
detect conflict
      ↓
identify affected files
      ↓
query context provider
      ↓
optionally invoke resolution agent
      ↓
verify
      ↓
continue
```

Never silently overwrite changes.

---

# 81. Development Server

Support long-running development processes.

Example:

```bash
paw service start web
```

Expose:

```text
stdout
stderr
ports
health
restart
logs
```

---

# 82. Port Management

Workspace should detect exposed ports.

Example:

```text
3000 → Next.js
5432 → PostgreSQL
6379 → Redis
```

Provide:

```bash
paw port list
paw port expose 3000
paw port close 3000
```

---

# 83. Resource Management

Expose runtime resources:

```text
CPU
memory
disk
network
processes
GPU where supported
```

Example:

```bash
paw workspace resources
```

---

# 84. Resource Policies

Allow:

```yaml
resources:
  cpu: 4
  memory: 8Gi
  disk: 30Gi
  gpu: false
```

Providers may reject unsupported resources.

The Workspace should report:

```text
Requested:
  GPU

Provider:
  Docker local

Status:
  unsupported
```

rather than silently ignoring it.

---

# 85. Workspace Templates

Provide templates:

```text
minimal
node
typescript
python
rust
go
fullstack
security
data
```

Templates should simply compose providers/configuration.

---

# 86. Security Profile

Provide security profiles:

```text
open
developer
restricted
locked
```

Example:

```yaml
security:
  profile: restricted
```

Profiles should configure:

```text
network
filesystem
credentials
Git
MCP
browser
processes
```

---

# 87. Secrets Boundary

Secrets must never automatically become visible to the agent.

Example:

```text
Secret:
NPM_TOKEN

Allowed:
package installation

Denied:
filesystem read
model prompt
agent logs
```

Secret values must be redacted from logs.

---

# 88. Audit Log

Record sensitive operations:

```text
secret access
network changes
Git push
PR creation
filesystem policy changes
runtime creation
agent start
MCP invocation
```

Expose:

```bash
paw audit
```

---

# 89. Testing

Build comprehensive tests for:

```text
kernel
service registry
event system
provider contracts
runtime lifecycle
repository lifecycle
context lifecycle
agent lifecycle
permissions
security
Git
verification
snapshots
CLI
SDK
```

---

# 90. Provider Contract Tests

Every provider should pass the same contract suite.

For example:

```text
RuntimeProviderContract
RepositoryProviderContract
ContextProviderContract
AgentProviderContract
```

A provider should not be considered compatible until it passes its contract tests.

---

# 91. Integration Tests

Build end-to-end tests:

```text
GitHub
    ↓
Workspace
    ↓
Runtime
    ↓
Clone
    ↓
ACC
    ↓
Agent
    ↓
Edit
    ↓
Test
    ↓
Commit
    ↓
Push
    ↓
PR
```

Run the same workflow with multiple providers where possible.

---

# 92. Example End-to-End

The canonical development flow should look like:

```bash
paw workspace create \
  --repo github:acme/project \
  --branch feature/auth \
  --runtime e2b \
  --context acc
```

Then:

```bash
paw agent start codex
```

Agent works.

Then:

```bash
paw verify
```

Then:

```bash
paw git diff
```

Then:

```bash
paw git commit
```

Then:

```bash
paw git push
```

Then:

```bash
paw pr create
```

---

# 93. Minimal Mode

Provide a minimal Workspace.

It should contain only:

```text
runtime
filesystem
shell
```

This is useful for:

```text
benchmarks
experiments
simple agents
CI
testing
```

---

# 94. Developer Mode

Developer mode adds:

```text
Git
repository
terminal
services
network
browser
context
verification
```

---

# 95. ProAgent Mode

ProAgent mode adds:

```text
ProAgent profile
skills
methods
rules
policies
ACC
MCP
verification
workspace requirements
```

---

# 96. CI Mode

Workspace should also be useful in CI.

Example:

```bash
paw workspace create \
  --repo "$REPOSITORY" \
  --commit "$COMMIT" \
  --runtime docker
```

Then:

```bash
paw verify
```

This allows the same environment used by agents to be used for automated verification.

---

# 97. Headless Mode

Everything must work without a UI.

Example:

```bash
paw workspace create --headless
paw agent start codex --headless
paw verify --headless
paw workspace destroy
```

Output should be machine-readable.

---

# 98. JSON Output

Every important CLI command should support:

```bash
--json
```

Example:

```bash
paw workspace inspect ws_123 --json
```

This allows agents and automation systems to consume Workspace state.

---

# 99. Structured Errors

Errors should have stable codes.

Example:

```json
{
  "code": "REPOSITORY_AUTH_FAILED",
  "message": "Repository authentication failed.",
  "provider": "github",
  "recoverable": true,
  "suggestions": [
    "Reconnect GitHub",
    "Verify repository permissions"
  ]
}
```

---

# 100. Logging

Use structured logging.

Every log entry should include where applicable:

```text
timestamp
workspaceId
sessionId
provider
operation
severity
duration
result
```

Never log secrets.

---

# 101. Repository Provider Security

Repository credentials must be scoped.

A GitHub integration should not automatically grant access to every repository in an account.

Users should explicitly select repositories where the provider supports selection.

---

# 102. Runtime Security

Remote runtimes should be isolated.

The Workspace should support:

```text
network policies
filesystem policies
process policies
resource limits
credential isolation
runtime destruction
```

The exact security guarantees depend on the runtime provider.

Expose provider security metadata.

Example:

```yaml
security:
  isolation: microvm
  network: restricted
  filesystem: isolated
```

---

# 103. Provider Metadata

Providers should declare their guarantees.

Example:

```json
{
  "provider": "e2b",
  "capabilities": [
    "filesystem",
    "shell",
    "network",
    "snapshot"
  ],
  "security": {
    "isolation": "microvm"
  }
}
```

---

# 104. Capability Discovery

Agents and users should be able to inspect capabilities.

```bash
paw capabilities
```

Example:

```text
Runtime
  ✓ filesystem
  ✓ shell
  ✓ network
  ✓ snapshots

Repository
  ✓ GitHub
  ✓ Git

Context
  ✓ ACC

Agent
  ✓ Codex

Tools
  ✓ MCP
  ✓ Browser
```

---

# 105. Dynamic Capability Resolution

If an agent requires:

```text
browser
```

Workspace should resolve an installed provider.

If no provider exists:

```text
Browser capability is unavailable.

Install a compatible browser provider.
```

This resolution must happen before the agent begins work when the capability is mandatory.

---

# 106. ProAgent Requirement Resolution

A ProAgent profile may specify:

```yaml
requirements:
  capabilities:
    - shell
    - filesystem
    - git
    - acc
    - browser
```

Workspace validates:

```text
shell       ✓
filesystem  ✓
git         ✓
acc         ✓
browser     ✗
```

The Workspace should prevent startup if a required capability is missing unless the profile explicitly marks it optional.

---

# 107. Optional Capabilities

Profiles may distinguish:

```yaml
capabilities:

  required:
    - filesystem
    - shell
    - git

  optional:
    - browser
    - gpu
```

---

# 108. Compatibility

Providers must declare compatibility.

Example:

```yaml
compatibility:
  os:
    - linux

  architectures:
    - x64
    - arm64

  runtimes:
    - docker
    - e2b
```

Agents can declare:

```yaml
agent:
  requires:
    os: linux
    shell: bash
```

Workspace resolves compatibility.

---

# 109. Environment Bootstrap

Workspace should support a bootstrap lifecycle.

```text
runtime creation
      ↓
environment bootstrap
      ↓
repository
      ↓
dependencies
      ↓
services
      ↓
context
      ↓
agent
```

Bootstrap steps should be observable and retryable.

---

# 110. Dependency Installation

Detect package managers and allow controlled installation.

Examples:

```text
npm
pnpm
yarn
bun
pip
uv
poetry
cargo
go
composer
bundler
maven
gradle
```

Do not assume every package manager is safe.

Apply network and execution policy.

---

# 111. Cache

Support dependency caches.

Examples:

```text
npm cache
pnpm store
pip cache
cargo registry
Go modules
Docker layers
```

Caches should be isolated according to security policy.

---

# 112. Workspace Persistence

Support different persistence modes:

```text
ephemeral
persistent
snapshot
```

Example:

```yaml
workspace:
  persistence: ephemeral
```

Ephemeral workspaces should be destroyed automatically when configured.

---

# 113. Cleanup

Provide:

```bash
paw workspace cleanup
```

Clean:

```text
stopped workspaces
expired snapshots
temporary artifacts
unused runtime resources
```

Never delete repositories or user-owned resources without explicit policy.

---

# 114. Remote Workspace

Eventually support:

```bash
paw workspace create --remote
```

The CLI connects to a Workspace server.

Architecture:

```text
Developer / Agent
        │
        ▼
Workspace Client
        │
        ▼
Workspace API
        │
        ▼
Runtime Provider
```

---

# 115. Workspace Server

The server should manage:

```text
authentication
authorization
workspace lifecycle
runtime allocation
provider lifecycle
logs
events
artifacts
snapshots
```

The same provider contracts should work locally and remotely.

---

# 116. Multi-Tenant Architecture

Do not make multi-tenancy a requirement for v1.

However, the architecture must not prevent it.

Workspace IDs, sessions, artifacts, credentials, and runtime resources should be scoped.

---

# 117. Open Source Structure

Recommended repository:

```text
proagents-workspace/
│
├── packages/
│   ├── core/
│   ├── cli/
│   ├── sdk/
│   ├── runtime/
│   ├── repository/
│   ├── context/
│   ├── agent/
│   ├── filesystem/
│   ├── shell/
│   ├── terminal/
│   ├── network/
│   ├── secrets/
│   ├── storage/
│   ├── verification/
│   └── observability/
│
├── plugins/
│   ├── github/
│   ├── git/
│   ├── acc/
│   ├── e2b/
│   ├── docker/
│   ├── local/
│   ├── codex/
│   ├── claude-code/
│   ├── opencode/
│   └── mcp/
│
├── examples/
├── templates/
├── docs/
├── tests/
└── scripts/
```

The exact package layout may change during implementation.

The important rule is that capability contracts and concrete implementations remain separated.

---

# 118. Technology Direction

Prefer:

```text
TypeScript
Node.js
pnpm
Vitest
Zod
CLI framework
```

Use TypeScript for:

```text
core
SDK
CLI
providers
contracts
configuration
```

Use platform-specific/native components only where required for:

```text
process isolation
PTY
filesystem operations
runtime integrations
```

---

# 119. API Design

Prefer strongly typed APIs.

Validate external configuration at boundaries.

Use schemas for:

```text
WorkspaceConfig
RuntimeConfig
RepositoryConfig
AgentConfig
ContextConfig
PermissionConfig
NetworkConfig
VerificationConfig
PluginManifest
```

---

# 120. Versioning

Version:

```text
Workspace API
provider contracts
plugin contracts
Workspace configuration
snapshots
```

Provider implementations should declare compatible API versions.

---

# 121. Backward Compatibility

Do not break existing Workspace configurations unnecessarily.

When a breaking change is required:

```text
detect old version
migrate configuration
validate
report migration
```

---

# 122. Developer Experience

The first five minutes must be excellent.

A new developer should be able to:

```bash
npm install -g @reposell/proagents-workspace
```

then:

```bash
paw workspace create \
  --repo github:myorg/myrepo \
  --runtime docker
```

and start coding with an agent.

---

# 123. Zero-Cloud Path

A developer should be able to use the project without paying for cloud infrastructure.

Required:

```text
local runtime
Docker runtime
local Git
local filesystem
```

Cloud providers should be optional.

---

# 124. Cloud Path

The same configuration should work with a cloud runtime.

For example:

```yaml
runtime:
  provider: e2b
```

Changing:

```yaml
runtime:
  provider: docker
```

should not require changing repository, context, agent, or verification configuration.

---

# 125. Canonical Workspace

A complete Workspace may look like:

```yaml
name: software-engineering

runtime:
  provider: e2b

repository:
  provider: github
  repository: acme/project
  branch: feature/auth

context:
  providers:
    - acc

agent:
  provider: codex

tools:
  mcp:
    - github
    - browser

services:
  - postgres
  - redis

network:
  mode: restricted

permissions:
  filesystem:
    read:
      - /workspace/repo

    write:
      - /workspace/repo

verification:
  commands:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build
```

This configuration describes the environment.

It does not describe the agent's professional identity.

That belongs to ProAgents.

---

# 126. ProAgent + Workspace

The final ecosystem should look like:

```text
                    PROAGENT
                       │
              Professional Profile
                       │
             ┌─────────┴─────────┐
             │                   │
           Skills             Methods
             │                   │
             └─────────┬─────────┘
                       │
                       ▼
                PROAGENTS WORKSPACE
                       │
          ┌────────────┼────────────┐
          │            │            │
       Runtime      Context      Repository
          │            │            │
         E2B          ACC         GitHub
          │            │            │
          └────────────┼────────────┘
                       │
                       ▼
                  Source Code
                       │
                       ▼
                 Build / Test
                       │
                       ▼
                    Git/PR
```

---

# 127. ACC + Workspace

ACC should provide understanding.

Workspace provides access.

For example:

```text
ACC:
"Authentication is implemented across these 14 modules."

Workspace:
"Here are those files and a shell where you can modify and test them."
```

The two systems complement each other without being coupled.

---

# 128. ProAgents + Workspace

ProAgents determines:

```text
What kind of professional agent is this?
What methods should it use?
What skills does it have?
What rules should it follow?
What verification should it perform?
```

Workspace determines:

```text
Where can it work?
What files can it access?
What commands can it execute?
What services can it run?
What network can it access?
What repository can it modify?
```

---

# 129. Example: Security Agent

ProAgents:

```yaml
profile:
  name: security-engineer

methods:
  - threat-modeling
  - secure-code-review
  - dependency-analysis
```

Workspace:

```yaml
runtime:
  provider: e2b

repository:
  provider: github

context:
  providers:
    - acc

tools:
  - semgrep
  - dependency-scanner

network:
  mode: restricted

verification:
  commands:
    - pnpm test
    - security-scan
```

The result is a professional security agent operating inside a controlled development environment.

---

# 130. Example: Full Autonomous Coding Agent

```text
GitHub repository
       ↓
Workspace
       ↓
E2B runtime
       ↓
ACC
       ↓
Codex
       ↓
Implement feature
       ↓
Run tests
       ↓
Analyze impact
       ↓
Fix failures
       ↓
Run verification
       ↓
Commit
       ↓
Push
       ↓
Create PR
```

---

# 131. Product Boundary

ProAgents Workspace owns:

```text
execution environment
workspace lifecycle
capabilities
permissions
providers
repository access
runtime
verification
observability
```

ProAgents owns:

```text
professional identity
agent profiles
skills
methods
rules
policies
agent composition
```

ACC owns:

```text
deep repository/context understanding
```

Agent providers own:

```text
agent execution
```

Repository providers own:

```text
remote source-control integration
```

Runtime providers own:

```text
actual infrastructure
```

---

# 132. Marketplace Compatibility

Do not build a marketplace into Workspace initially.

However, the architecture should allow ProAgents Marketplace to distribute:

```text
Workspace profiles
runtime providers
repository providers
context providers
agent adapters
verification packs
MCP integrations
tool providers
```

A ProAgent installation can therefore resolve both:

```text
professional requirements
```

and:

```text
workspace requirements
```

---

# 133. Installation Flow

Eventually:

```bash
proagent install software-engineer
```

can resolve:

```text
ProAgent profile
      ↓
Workspace profile
      ↓
required providers
      ↓
ACC
      ↓
GitHub
      ↓
runtime
      ↓
agent adapter
      ↓
verification
```

Workspace remains an independent product.

---

# 134. First Release

Do not implement everything at once.

V1 should focus on:

```text
Workspace Kernel
CLI
Local Runtime
Docker Runtime
Git
Repository Provider
GitHub Provider
ACC Provider
Filesystem
Shell
Agent Provider
Verification
Workspace Configuration
Logs
```

Then add:

```text
E2B
MCP
Secrets
Browser
Snapshots
Services
Remote API
```

---

# 135. V1 Golden Path

The first release must make this workflow work:

```bash
paw workspace create \
  --repo github:org/repository \
  --runtime docker \
  --context acc
```

Then:

```bash
paw agent start codex
```

Agent:

```text
inspect repository
        ↓
query ACC
        ↓
modify files
        ↓
run tests
        ↓
inspect failures
        ↓
modify files
        ↓
run tests
        ↓
verify
```

Developer:

```bash
paw git diff
paw git commit
paw git push
paw pr create
```

That is the core product.

---

# 136. Definition of Done

The project is ready for its first public release when:

### Workspace

* [ ] Workspace can be created
* [ ] Workspace can be destroyed
* [ ] Workspace can be inspected
* [ ] Workspace can be exported
* [ ] Workspace can be recreated

### Runtime

* [ ] Local runtime works
* [ ] Docker runtime works
* [ ] Runtime abstraction is provider-neutral

### Repository

* [ ] Generic repository contract exists
* [ ] Git implementation works
* [ ] GitHub implementation works
* [ ] Branch operations work
* [ ] Push works
* [ ] Pull request creation works

### Context

* [ ] Context provider contract exists
* [ ] ACC provider works
* [ ] Context lifecycle is observable
* [ ] Context failures do not corrupt Workspace

### Agents

* [ ] Agent provider contract exists
* [ ] At least one coding agent works
* [ ] Agent can access Workspace
* [ ] Agent can modify repository
* [ ] Agent can run commands

### Verification

* [ ] Tests can run
* [ ] Build can run
* [ ] Results are captured
* [ ] Verification status is exposed

### Security

* [ ] Runtime permissions work
* [ ] Network policies work
* [ ] Secret values are protected
* [ ] Git destructive operations are guarded
* [ ] Logs redact secrets

### Developer Experience

* [ ] CLI works
* [ ] JSON output works
* [ ] `paw doctor` works
* [ ] Documentation exists
* [ ] Examples exist
* [ ] Provider contract tests exist

---

# 137. Final Product Definition

ProAgents Workspace is:

> **An open-source programmable workspace where AI agents can safely work on real software.**

It provides the environment between an agent and the software it needs to modify.

```text
                    AGENT
                      │
                      ▼
             PROAGENTS WORKSPACE
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   REPOSITORY      CONTEXT        RUNTIME
       │              │              │
     GitHub          ACC          E2B/Docker
       │              │              │
       └──────────────┼──────────────┘
                      │
                      ▼
                  CODEBASE
                      │
              ┌───────┴───────┐
              ▼               ▼
            TEST            BUILD
              │               │
              └───────┬───────┘
                      ▼
                  VERIFICATION
                      │
                      ▼
                   GIT / PR
```

The Workspace should make the transition from:

```text
"AI agent"
```

to:

```text
"AI agent with a real computer, real repository, real context, real tools, and a controlled execution environment"
```

simple, reproducible, and programmable.

---

# 138. Initial Repository Goal

The implementation team should not begin by building a UI.

Build in this order:

```text
1. Contracts
2. Kernel
3. Service registry
4. Event system
5. Workspace lifecycle
6. Local runtime
7. Filesystem
8. Shell
9. Git
10. Repository provider
11. GitHub provider
12. Context provider
13. ACC provider
14. Agent provider
15. Verification
16. Docker runtime
17. CLI
18. E2B runtime
19. MCP
20. Secrets
21. Browser
22. Remote API
23. UI
```

Every stage should be usable independently.

---

# 139. Critical Architectural Rule

Do not solve provider-specific problems in the kernel.

If GitHub needs special behavior:

```text
GitHub provider
```

If ACC needs special behavior:

```text
ACC provider
```

If E2B needs special behavior:

```text
E2B runtime
```

If Codex needs special behavior:

```text
Codex agent adapter
```

The Workspace contracts should remain stable.

The product should grow by adding capabilities rather than increasing the complexity of the core.

---

# 140. Success Criterion

The ultimate test is whether a developer can take an arbitrary coding agent and give it a complete working environment with a command such as:

```bash
paw workspace create \
  --repo github:org/project \
  --runtime e2b \
  --context acc \
  --agent codex
```

and arrive at:

```text
┌─────────────────────────────────────────────┐
│             PROAGENTS WORKSPACE             │
│                                             │
│  Repository      github:org/project         │
│  Branch          feature/...                │
│  Runtime         E2B                        │
│  Context         ACC                        │
│  Agent           Codex                      │
│                                             │
│  Filesystem     ✓                           │
│  Shell          ✓                           │
│  Git            ✓                           │
│  Network        Restricted                  │
│  Tests          ✓                           │
│  Build          ✓                           │
│  Verification   ✓                           │
│                                             │
│  Status: READY                              │
└─────────────────────────────────────────────┘
```

The agent then works normally.

The developer can inspect everything.

The Workspace can reproduce the environment.

And ProAgents can later provide the professional layer on top.

---

# 141. Multi-Workspace Isolation

A single Workspace process can host multiple **named workspaces** at once. Each named workspace is an isolated plugin scope: its own service registrations, its own filesystem root, its own sandbox policy, and its own session log — so several projects can run independent agents simultaneously without sharing capability state.

Named workspaces are declared in `workspace.yaml` under the optional `workspaces:` map. Keys are kebab-case workspace ids; each entry declares a `root` (required, relative to the configuration file) and may override the sandbox mode, plugin selections, agent provider, and context providers:

```yaml
workspaces:
  frontend:
    root: ./projects/frontend
    sandbox:
      mode: read-only
  backend:
    root: ./projects/backend
    sandbox:
      mode: workspace-write
    agent:
      provider: codex
```

Isolation semantics:

- **Scoped service resolution.** The kernel's scoped registry holds a root registry plus one scope per mounted workspace. A capability (filesystem, runtime, agent, …) is instantiated independently per scope; a scope's registration shadows the root, and resolution falls through to the root for ids the scope did not register. Uniqueness of a capability is decided per scope — two workspaces never collide with each other.
- **Declarative roots.** A workspace root must exist on disk before it can be mounted; mounting fails with `WORKSPACE_INVALID_STATE` otherwise. The root is also the boundary of the scope's filesystem grants — grants come from the validated configuration, never from a plugin's own request.
- **Configuration-reconstructable.** Only workspaces declared in `workspace.yaml` can be mounted (`WORKSPACE_NOT_FOUND` otherwise). A running process with all its mounted workspaces is reconstructable from configuration alone.
- **Mount/unmount lifecycle.** Mounting validates the entry, resolves the sandbox mode, opens the session log, and activates the workspace's plugins into its scope (`workspace/mounted`). Unmounting deactivates those plugins in reverse order and disposes exactly that scope (`workspace/unmounted`); the parent workspace and other workspaces keep running. Remounting the same id afterwards starts from a clean scope.
- **Shared event bus.** All scopes emit on one typed event bus, so protection (Repo Shield) covers every workspace. Lifecycle payloads carry the `workspaceId` where the event contract defines one.

Honest comparison: DeepSeek Harness groups directories for UX and isolates execution through its sandbox; its workspace registry is not a security boundary. The Workspace draws the same line — named workspaces isolate service state and configuration, while the sandbox policy (section 142) and permission grants (section 34) remain the enforcement layers.

---

# 142. Sandbox Policy

Every workspace — the parent and each named workspace — may declare a sandbox policy:

```yaml
sandbox:
  mode: workspace-write
```

Modes, in increasing permissiveness:

| Mode | Behavior |
|---|---|
| `read-only` | No filesystem writes, no deletions. |
| `workspace-write` (default) | Writes confined to the workspace root. |
| `danger-full-access` | Unconfined; explicit opt-in. |

The default is `workspace-write` for backward compatibility with existing workspace configurations. For unattended multi-workspace runs, `read-only` is the recommended mode. (DeepSeek Harness defaults to `read-only`; the difference is deliberate and documented here.)

The sandbox is **same-world confinement**: a process still shares the host kernel and filesystem. It is not a virtual machine, container, or microVM. When the whole environment must be isolated, use a runtime provider that provides real isolation (section 20). This limitation is always reported honestly — never silently downgraded.

Fail-closed semantics:

- A write or deletion under `read-only` is vetoed **before** execution with `SANDBOX_POLICY_VIOLATION` — before any byte is touched and before the `filesystem/before-write` protection event fires.
- A host-process shell **cannot** enforce `read-only` confinement (any spawned command could write). Under `read-only`, shell execution therefore fails closed with `SANDBOX_UNAVAILABLE` instead of running unconfined.
- A policy that cannot be enforced by a capability is an error, never a silent downgrade.

Named workspaces resolve their mode from the workspace entry; the parent workspace declares its own mode at creation. An explicit override may be supplied by the operator at mount time.

---

# 143. Session Log

Every named workspace keeps an **append-only session log** — the record of what the agent saw and did, written before anything else consumes it. The log is one JSONL file per workspace, under the Workspace metadata tree (`.paw/sessions/<workspace>/session.jsonl`).

Properties:

- **Append-only.** Records are never rewritten or deleted in place. Resume, fork, search, and replay operate on the same stream.
- **Structured.** Each entry carries a timestamp, workspace id, session id, a structured kind (`agent/prompt`, `tool/result`, `workspace/event`, …), the provider, and data fields.
- **Redacted at write time.** The same redaction rules as structured logging (section 100) apply before a record reaches the disk — secrets never enter the log.
- **Bounded reads.** Readers take a bounded tail; nothing requires loading the whole history.

The session log is the substrate for resume and replay. A future provider may implement fork (a new session seeded from a past log) on the same format.

---

# 144. Harness Adapters

The Workspace is the policy and verification backend for coding harnesses (OpenCode, Codex, Claude Code, Gemini CLI, custom). A **harness adapter** is a capability plugin (`HarnessProvider`) that attaches the Workspace to a host harness so Workspace events and decisions reach the harness lifecycle — and so the harness's own activity becomes observable here.

Integration tiers, reported honestly:

- **`native`** — the harness exposes a plugin/hook surface (for example Codex plugin-bundled `hooks/hooks.json` with blocking `PreToolUse`, or the OpenCode plugin API). Decisions can veto before execution.
- **`process`** — the adapter launches the harness as a child process. Enforcement is advisory and observability is reduced. A `process` adapter must report `process` — it can never claim `native`.

The adapter surface is deliberately small: detect availability, `attach` (install native hooks or spawn the child), `detach` (idempotent), and `enforce` — push a Workspace decision onto the harness and receive a `HarnessEnforcement` result that states whether the decision was actually applied and whether enforcement is `blocking` or `advisory`. An adapter never claims a block it did not enforce.

Normalized harness-side lifecycle events flow through the typed event bus so the rest of the Workspace can subscribe without knowing the harness:

```text
session/starting · session/started · session/stopping · session/stopped
model/before   · model/after     · model/error
compaction/planned · compaction/started · compaction/completed
```

`model/before` is awaited: a subscriber can veto a model call before it happens, exactly as `command/before` vetoes a shell command (sections 101–102).

Kernel purity (section 139) applies unchanged: adapters are plugins, the kernel knows only the contract. Intercepting the harness lifecycle — never the harness process or binaries — keeps the arrangement portable across harnesses and safe across harness upgrades.

---

# 145. Desktop UI — Retired

The desktop application was RETIRED in v0.3.0 and its supplement (`PROAGENTS-WORKSPACE-UI.md`) removed. The product is the **CLI + the developer's terminal**: `paw` prepares, verifies, and observes the workspace; the coding agent (Codex, Claude Code, OpenCode, Gemini CLI, DeepSeek Harness, Freebuff, …) works in that environment through its own interface.

Rationale (product model, section 148): the Workspace is a clean workstation for AI coding agents — not an application platform. A desktop shell duplicated what the agent and terminal already provide, and its removal keeps the kernel, contracts, and CLI the entire surface.

The section number is RETIRED, not renumbered (spec section numbers are stable identifiers). Two boundary rules survive it and remain normative for any future interface work: every interface is a PROJECTION over kernel events and the session log — never the source of truth — and any adapter surface must reflect real `HarnessProvider` capabilities, reported honestly (sections 101–102, 141–144).

---

# 146. Plugin-First Architecture

The Workspace follows a **DeepSeek-Harness-inspired plugin architecture**. The governing principle is normative:

> **Everything that can be replaced, extended, configured, or composed is a plugin.** The core provides the runtime and contracts — plugin loading, lifecycle orchestration, events, permissions, persistence, and the workspace model — never hard-coded development behavior.

This section generalizes what sections 9, 59, and 139 already established, and binds every future capability to it.

## Core vs. plugins

The kernel and product core own exactly:

- Plugin discovery, validation, loading, and the activation lifecycle (section 59)
- The capability contracts and service registry (section 9)
- The lifecycle engine: stage sequencing, policies, transitions, events (sections 6, 16)
- The event bus, permission framework, approval policy, session log, workspace isolation (sections 7, 34, 141–143)
- The runtime, execution, and artifact management surfaces

Everything else — harnesses, agents, tools, lifecycle definitions, stages, gates, context providers, integrations, UI capabilities — is a plugin. Adding a new AI harness, agent, model provider, browser, test runner, MCP server, development stage, deployment provider, or workflow **must not require changing the core**.

## Declarations, not switches

Plugins declare what they need and how they run; consumers resolve declarations generically. Concretely:

- A plugin manifest may carry a **runtime descriptor** (`kind`: process | service | external, `command`, `label`) describing how the capability materializes outside the kernel. The agent plugins declare their CLI binary this way; launch flows read the descriptor from the plugin catalog — they never maintain an agent-kind→binary table.
- The lifecycle engine never branches on a specific provider (`if harness === "opencode"`, `if stage === "testing"`). It resolves stages, agents, tools, and gates by id through the registry and executes them through the contracts.
- Product layers MAY ship **default configuration data** (a default lifecycle, a default plugin set), but defaults are data — declarative, overridable per workspace — never compiled-in behavior.

## The lifecycle engine remains the authority

Plugin-first does not mean plugins control execution. Plugins **provide capabilities**; the core lifecycle engine decides which stage runs, which plugins are available to it, which tools are granted, when execution starts and stops, whether a transition is valid, whether a gate passed, whether a failure retries, and whether the run can ship. A plugin cannot bypass lifecycle policy; protection and permission intervention (sections 101–102, 34) apply to plugin execution unchanged.

## Architectural test

For every new capability, ask: *can this be a plugin?* If yes, implement it as a plugin. If it must be core infrastructure, document why in this spec or in `docs/architecture.md` — an undocumented exception is a violation, not a precedent.

---

# 147. Chat Workspaces — Isolation, Materialization, Retirement

Every chat is an isolated environment. The governing rule is normative:

> **A chat owns a workspace; a workspace never becomes shared.** Each chat creates its own NEW, EMPTY workspace directory and any project it names is MATERIALIZED INTO that directory. Two chats never map to the same directory, and no chat works in place inside a project, another chat, or the user's own checkout. Sharing is explicit (section 36 of the UI spec) — never the silent default.

## Layout

Chat workspaces live under a per-machine base directory:

```text
<base>/
  chats/<chat-id>/     # one directory per chat — unique per run
  repos/               # DELETED as a concept: no shared clone targets
  .paw/sessions/       # per-chat append-only session logs (section 143)
```

`<chat-id>` = sanitized name + random suffix, so two chats with the same display name still never collide. The first crew member's agent id EQUALS the workspace id (1:1, section 141); additional crew members join the same chat workspace under suffixed ids.

## Materialization

The wizard's project step chooses what is materialized INTO the fresh workspace. All three paths run as real, visible commands in the chat's terminal — never hidden API work:

- **Empty workspace (default).** No project. A blank environment the crew fills.
- **GitHub repo → per-chat clone.** `git clone <url> .` inside the chat's workspace. Each chat gets its own clone; there is no shared clone directory anymore.
- **Local folder → per-chat worktree or copy.** A local GIT repository is attached with `git worktree add -b <per-chat-branch>` — a linked worktree: instant, space-efficient, one object store, the source repo keeps its own branch untouched (T3-Code-inspired). A non-git folder is copied with a `tar` pipe that excludes state directories (`node_modules/`, `dist/`, `coverage/`, `.git/`, `.paw/`, `.acc/`) — a chat inherits the project's CODE, never another environment's STATE.

## The project catalog is declarative

Connected projects are SOURCE records (id, name, repo, origin), not directories. Registration creates no directories, binds no roots, and refuses chat workspace directories as sources. Resolving a project for a chat always materializes fresh content into that chat's workspace.

## Retirement: settle and purge

- **Settle** marks finished work out of the active list and destroys nothing — the workspace, session log, and worktree stay on disk and the chat can resume. Settled is not stopped.
- **Purge** deletes the chat's workspace directory for good. It is GUARDED: uncommitted tracked changes or non-ignored untracked files refuse the purge (the error states that nothing was deleted); an explicit force destroys the work and reports what was destroyed. Purging a linked worktree runs `git worktree remove` against the source repo so no stale worktree metadata survives. Purge containment is absolute — only directories under `<base>/chats/` are eligible.

Chat workspaces are runtime state (per-machine), not repository content — the base directory is never committed.

---

# 148. Convention-First Local Mode (Product Model)

The default product experience is a **lightweight developer tool**, not a platform adoption. The product rule is normative:

> **Everything that can be inferred locally should be inferred locally before asking the developer to configure it. Everything that can remain optional should remain optional until the user needs it.**

## The golden path

```bash
npm install -g @reposell/proagents-workspace
cd any-git-project
paw init
paw status
paw verify
codex        # or claude, opencode, gemini, dsh — the developer's agent is never replaced
```

This must work without Docker, E2B, GitHub, ACC, ProAgents, MCP, a cloud account, or an API key. A local Git repository is already a valid Workspace. There is no desktop application — the terminal is the interface.

## Terminology (normative)

- **Workspace** (default) — the developer's project environment. `paw` operates on the CURRENT repository; the project is never cloned, moved, or rewritten.
- **Isolated workspace / runtime workspace** — the heavier sandboxed mode created explicitly with `paw workspace create --runtime docker|e2b|…`. Used for automation, CI, untrusted or parallel agents.

The two concepts must not be conflated in product language. There is no desktop application; the CLI and the developer's terminal are the only product interface.

## Progressive levels

```text
Level 0  Zero configuration    paw            detect and explain, write nothing
Level 1  Initialize            paw init       minimal .paw/ metadata only
Level 2  Agent integration     paw agent list detection + honest integration tiers
Level 3  Verification          paw verify     inferred from project scripts
Level 4  Context               ACC etc.       optional context providers (plugins)
Level 5  Lifecycle             programmable; default inferred, never forced
Level 6  Isolation             paw workspace create --runtime …  (opt-in)
```

(Level 7, the desktop application, was retired in v0.3.0 — see spec section 145.)

## Conventions (what `paw init` creates)

Workspace metadata is separated from application source code:

```text
.paw/
├── workspace.yaml      # minimal; `version: 1` is valid configuration
├── research/           # paw research artifacts (section 149)
├── proagents/          # handoff artifacts for the ProAgents layer (section 149)
├── sessions/           # append-only session logs (section 143)
└── artifacts/
```

`paw init` NEVER overwrites project files, NEVER rewrites package.json, NEVER installs dependencies silently, NEVER changes Git history or remotes. Existing `AGENTS.md`/`.acc/` files are respected — they are owned by their existing owners (ACC), not duplicated into `.paw/`.

## Configuration UX and precedence

A minimal configuration is just:

```yaml
version: 1
```

Everything else is inferred. Precedence (highest applied last):

```text
built-in defaults → global user config (~/.paw/config.yaml) → project config (.paw/workspace.yaml)
→ workspace profile → environment (PAW_* variables) → CLI flags
```

The default tool set for a zero-config local workspace is `filesystem` + `shell`; the guarded repository capability activates when configuration or an isolated workspace asks for it. Simple commands (`status`, `doctor`, `agent list`) do NOT boot plugins or runtimes — capability activation is lazy (spec sections 37–38). Performance targets: `paw --help` < 100 ms, `paw status` < 200 ms, `paw doctor` < 500 ms, `paw verify` = project-dependent.

## Environment discovery (capability-based)

Agent/context integration is discovery, not a hard-coded conditional. The detector resolves DECLARED integration probes (binary on PATH, well-known config files) and classifies them:

```text
agent-frameworks   codex, claude, opencode, gemini, dsh, aider, …
context-frameworks ACC, AGENTS.md, CLAUDE.md, .cursorrules, …
tool-protocols     MCP
runtimes           git, node, python, cargo, go, docker
providers          (model/API providers, when present)
```

Integration tiers are reported honestly and never inflated:

```text
Tier 0  detect       the integration was found
Tier 1  environment  conventions/env available to the agent
Tier 2  process      the workspace can launch it
Tier 3  native       native hooks/plugin APIs (only when real)
```

## Advanced path (unchanged)

The same core architecture still supports the isolated, automated workflow:

```bash
paw workspace create --repo github:org/project --runtime e2b --context acc --agent codex
paw lifecycle run
```

---

# 149. Workspace Research — Product/Environment Discovery

`paw research` is the integration point between the product-level Workspace and the ACC / ProAgents ecosystems. It answers:

> **"What kind of coding environment does this product need?"**

ACC answers "what does this repository/environment know" (knowledge substrate). ProAgents answers "how should an agent operate professionally" (professional-agent substrate). The harness answers "where does the agent execute". Workspace orchestrates the convergence — it is not a competing context manager, interview engine, or agent framework.

## Ownership boundaries (normative)

- **Workspace owns PRODUCT questions**: what are we building, who is it for, what is the workflow, what does "done" mean. These determine the coding environment.
- **ACC owns context**: `AGENTS.md`, `.acc/`, architecture graphs, memory. Research CONSULTS context providers through the existing `ContextProvider` contract; it never duplicates or rewrites their files.
- **ProAgents owns agent questions**: role, skills, methods, rules, permissions, crews. Workspace hands product/environment requirements to ProAgents via a machine-readable artifact; it never generates skills or profiles itself.

## The research flow

```text
paw init
   ↓
paw research
   ├─ Context providers (ACC / git / filesystem — plugins, resolved generically)
   ├─ Repository facts (manifests, scripts, lockfiles)
   ├─ Environment facts (detected agents, runtimes)
   ↓
Research model (.paw/research/research.json — machine-readable)
   ↓
Uncertainty detection → highest-value product questions
   ↓
User answers (interactive, or `paw research answer <id> <answer>` — resumable)
   ↓
Coding environment assembly (verification, conventions, lifecycle defaults)
```

When no context provider is available, research degrades honestly:

```text
No context provider available. Workspace will continue using standard repository context.
```

## Artifacts

```text
.paw/research/research.json     # the research model (facts + questions + provenance)
.paw/research/product.md        # human-readable projection
.paw/research/decisions.md      # append-only record of resolved decisions
.paw/proagents/requirements.json # agent-level requirements handed to ProAgents
```

Every fact records provenance (`context-provider`, `repository`, `environment`, `user`). A fact already present — from ANY source — never becomes a question. Questions are derived from uncertainty only; the interview is progressive (answers may close or refine later questions) but never a giant questionnaire.

## Boundary with the kernel

Research is a PRODUCT capability in the SDK/CLI layer, not a kernel or provider concern (kernel purity, section 139): the SDK consumes the existing `ContextProvider` contract through supplied providers and never imports concrete plugins (dependency direction, section 50). Context providers participate during research exactly as they do at runtime — as plugins.

---

# 150. Checkpoints and Gates — the Convergence Architecture

The Workspace's execution model is a **checkpoint + gate loop** (Helix-inspired; the convergence pattern is the point, not any vendor's agent roster):

> **Small work → isolated context → objective evidence → hard gate → feedback → retry → proven checkpoint → next checkpoint.**

The core rule is normative and holds at every level:

> **ATTEMPT ≠ COMPLETION. An agent saying "finished" is an attempt; only GATES complete a checkpoint.**

## The five primitives

```text
Research      discovers what should be built (section 149)
Context       ACC / providers establish what is known
Checkpoints   define small independently verifiable units of work
Gates         prevent unproven work from progressing
Lifecycle     Initialize → Develop → Validate → Release → Distribute
```

ProAgents provides the agents; the Workspace provides the lifecycle in which those agents converge on a validated result. RepoSell receives a validated release artifact — never an arbitrary repository.

## Checkpoints

A checkpoint is a small, ordered, dependency-aware unit of work (a DAG — parallel checkpoints and later merges are first-class): id (`CP-###`), title, scope, acceptance criteria, gates, and an optional visual reference (prototype/design/screenshot — the agent is never left guessing what the UI should look like).

Status machine: `planned → ready → running → (awaiting-approval) → passed | failed | blocked`. Plans load from `.paw/checkpoints.json` (convention) or `checkpoints.plan` in the workspace configuration. A failed checkpoint stops the plan (fail-closed): subsequent work would rest on unproven ground.

## Gates are plugins

Gates are resolved through the registry against the `gate` capability — the kernel NEVER hard-codes gate kinds and NEVER branches on `kind` (sections 139/146). Bundled providers:

```text
behavior      proves behavior by executing a command (exit 0 = passed)
visual        visual verification against a declared reference (provider-pluggable)
adversarial   fresh-context reviewer agent; passes only on ZERO unresolved blockers
human         product-authority approval; honest advisory reporting in autonomous mode
security      Repo Shield's protection evaluation INSIDE the checkpoint loop (fails closed without a provider)
```

A checkpoint declares its own gate set — logic-only work needs no visual gate, UI work may skip performance. Every gate produces EVIDENCE (status, findings, duration, provenance) or nothing; a gate that crashes cannot pass a checkpoint. Human feedback that rejects a checkpoint is a finding the host converts into learnings and a follow-up checkpoint.

## Context isolation per checkpoint

The reviewer/agent context for a checkpoint is NOT the whole repository or the implementer's conversation:

```text
Agent Context = checkpoint + relevant ACC context + relevant files
              + dependencies + acceptance criteria
              + previous checkpoint evidence + applicable ProAgent instructions
```

## Commands and events

```bash
paw checkpoint list | run | status
```

Typed events: `checkpoint/started`, `checkpoint/gate-started`, `checkpoint/gate-completed`, `checkpoint/completed`, `checkpoint/failed` — every interface built on them is a projection (section 145 survives as a rule, not a product).

# The canonical lifecycle (section 151)

Verification is not a single final step; the workspace runs a programmable development lifecycle. The kernel owns the **canonical phases** — the fixed spine every workspace shares — while executors and plugins own the **phase work**. No provider business logic enters the kernel (section 139 still applies).

## Canonical phases

```
create → research → initialize → plan → develop → verify → release → distribute → operate
```

A flow is an ordered list of stages, each bound to a phase with an execution mode:

| Mode | Meaning |
|------|---------|
| `checkpoint-plan` | The phase's work is a checkpoint plan (section 150 gates) |
| `command` | A shell command provided by the stage |
| `research` | Delegates to `paw research` (section 149 product interview) |
| `manual` | The phase needs a human/agent to run its commands, then continue |

## Defaults and contribution

`paw lifecycle show` prints the effective flow. The default flow ships with sensible commands (initialize runs `paw init`; verify binds the workspace checkpoint plan). Stage plugins contribute phases **declaratively** via the manifest:

```yaml
lifecycleStages:
  - phase: custom
    after: research
    id: threat-model
    title: Threat model the plan
    execution: manual
```

Contributions insert after their anchor phase (or stage id); an unknown anchor is skipped silently — a plugin can never reorder or remove canonical phases. The bundled stage plugin `stage-threat-modeling` demonstrates the pattern.

## Commands and events

```bash
paw lifecycle show | run | status
```

`run` executes stages in order, fail-closed: a required-phase failure stops the flow, skips are explicit with reasons, and outcomes persist to `.paw/state/lifecycle-state.json`. Typed events: `lifecycle/phase-started`, `lifecycle/phase-skipped`, `lifecycle/phase-completed`, `lifecycle/flow-completed` — every interface built on them is a projection.

## Division of authority

PAW owns the lifecycle, plugins own the capabilities, checkpoints own the work, gates own trust, evidence owns proof. Executors (agent harnesses) own how phase work gets done; the kernel only orchestrates phases and enforces policy (parallel, required, onFailure, maxRetries).

# Agent bootstrap (section 152)

The Workspace must be installable BY an AI agent, not merely FOR one. A human pastes one line into any coding agent that can run shell commands (Claude Code, Codex, Gemini CLI, OpenCode, …):

```text
Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md (project's instructions).
```

The agent — with no prior knowledge of ProAgents — reads this repository's bootstrap protocol and runs the deterministic installer:

```bash
npx @reposell/proagents-workspace@latest install
```

The ecosystem roles are unchanged (section 2): ProAgents is WHO the agent is (https://github.com/EnzoVezzaro/proagents), ACC is WHAT it understands, the Workspace is WHERE it works. The Workspace bootstrap never requires ProAgents and never speaks for it.

## The distribution thesis

> The GitHub repository is the distribution package; `AGENTS.md` is the universal bootstrap protocol; `npx @reposell/proagents-workspace@latest` is the deterministic installer; `.paw/` is the runtime configuration.

## The contract files (this repository)

| File | Role |
|------|------|
| `AGENTS.md` | Universal agent instructions — the entrypoint any agent reads first |
| `install/manifest.yaml` | Machine-readable package metadata: name, version, install command, configuration directory, requires |
| `install/install.yaml` | The install contract as data: five phases, what is written, what is NEVER touched |
| `install/AGENT.md` | The bootstrap protocol — the exact steps an external agent follows |
| `install/instructions.md` | The human-facing install guide |
| `templates/AGENTS.md` | The shape of the AGENTS.md written into a target repository (generator in the SDK; tests pin the shape) |

## The five phases

`paw install` (the same code path as the npx entrypoint) runs:

```
inspect → understand → initialize → configure → verify
```

| Phase | What happens |
|-------|--------------|
| inspect | Detects languages, runtime, package manager, frameworks, monorepo, coding agents (spec 148 conventions) |
| understand | Infers project intent — product type, domains, skills — from `@README.md` + manifests; every inference names its source |
| initialize | Creates `.paw/` metadata only when absent; existing configuration is preserved |
| configure | Writes `AGENTS.md` agent notes when absent; reports the verification plan and the canonical lifecycle (section 151) |
| verify | Reports the verification plan; executes checks only when the host asks (`paw install --verify`) |

## Starting from a file — the `@README.md` contract made literal

The prompt "Setup … for @README.md" implies that the workspace starts FROM the project's own description. Both entrypoints accept a source file (any text file; default behavior is unchanged when omitted):

```bash
paw init README.md       # init, inferring intent from README.md
paw install BRIEF.md     # five-phase install, driven by BRIEF.md
```

The inferred intent (product type, domains, skills, provenance) is persisted into the generated `.paw/workspace.yaml` as the `project:` block — informational data, never a gate, named sources, edit freely:

```yaml
project:
  productType: browser-application
  domains:
    - local-first
    - ai
  derivedFrom:
    - README.md
    - package.json
```

Rules: manifest evidence always appears in `derivedFrom` alongside the source file; a source file that cannot be read is a structured `INTENT_SOURCE_UNREADABLE` error (the config must never silently lie about what it understood); an already-initialized workspace keeps its existing config (the file-driven path is part of the same idempotency contract).

## The init process (what agents and humans actually run)

Every path ends in the same deterministic, idempotent machine — pick by context:

| Context | Command | Source of intent |
|---------|---------|------------------|
| No CLI installed, agent-led (the canonical UX) | `npx @reposell/proagents-workspace@latest install` | `@README.md` + manifests (default) |
| No CLI installed, specific file | `npx @reposell/proagents-workspace@latest install BRIEF.md` | that file + manifests |
| `paw` already installed, specific file | `paw init README.md` or `paw install <file>` | that file + manifests |
| `paw` already installed, inference only | `paw init` | manifests + environment (no README prose) |
| Re-initialize / inspect afterward | `paw status` | the effective picture (idempotent no-op re-runs) |

The process for an agent, in order (full protocol in `install/AGENT.md`):

1. Read the target's `README.md` and existing agent instructions (preserve them — never overwrite).
2. Run the installer (`npx @reposell/proagents-workspace@latest install [file]`, or `paw init <file>` when installed) — the five phases: inspect → understand → initialize → configure → verify.
3. Report the resulting configuration: the five-phase report, the persisted `project:` block, the verification plan, the lifecycle (`paw lifecycle show`).

The machine-readable statements of this process live in the `install/` folder of this repository — `install/manifest.yaml` (package metadata + install command), `install/install.yaml` (the contract as data: phases, writes, nevers), `install/AGENT.md` (the protocol an external agent follows), `install/instructions.md` (the human-facing guide). Documentation: [Agent Bootstrap](docs/bootstrap.md).

## What an install never does

- Modifies application code, rewrites `package.json`, or changes git state.
- Overwrites an existing `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or `.paw/` configuration.
- Runs the project's tests uninvited.
- Requires an account, a token, or network access beyond npx itself.

## The target repository afterwards

```
repo/
├── AGENTS.md              ← agent notes (only if none existed)
└── .paw/                  ← runtime configuration
    ├── workspace.yaml     ← minimal; everything else is inferred
    ├── sessions/
    └── artifacts/
```

`.agents/` in the Workspace's own repository is the cross-agent comment channel; the Workspace never writes to `.agents/` in a target repository (section 146 hygiene: agent-owned files stay agent-owned). Inference is additive and honest: detection from manifests wins, the README fills what manifests cannot say, and every claim in the report names the file it came from.

# Self-diagnostics: paw check (section 153)

The framework applies its own medicine: the same regime the ACC framework applies to repositories (`acc check`, the ACC0xx registry) applied to the Workspace's own configuration artifacts. Configuration drift — the class of defect where docs, manifests, and code silently disagree — is detected with stable codes, not discovered by embarrassment.

```bash
paw check            # framework + workspace checks; human-readable
paw check --json     # machine-readable (agent-first)
```

Exit code 1 on any error-severity finding; warnings do not fail a gate. `paw check` runs inside the framework repository (full checks), inside an initialized target workspace (workspace checks), or anywhere else (reports `PAW012` honestly).

## The PAW0xx registry

Diagnostic codes are a stability contract — never reused, never retyped (same rule as error codes, section 99):

| Code | Severity | Catches |
|------|----------|---------|
| `PAW001` | error | `install/manifest.yaml` version ≠ released CLI version |
| `PAW002` | error | workspace package versions disagree with each other |
| `PAW003` | error | `AGENTS.md` section-count claim ≠ actual spec sections in `README.md` |
| `PAW004` | warning | `templates/AGENTS.md` and the SDK generator have drifted apart |
| `PAW005` | error | a bootstrap contract file (`install/`, `templates/`) is missing |
| `PAW006` | error | `.paw/workspace.yaml` fails schema validation |
| `PAW007` | warning | a spec citation points beyond the actual spec length |
| `PAW008` | error | the current version has no `CHANGELOG.md` entry |
| `PAW009` | error | a documented command is missing from `docs/cli-reference.md` |
| `PAW010` | warning | `.paw/state/lifecycle-state.json` is not readable JSON |
| `PAW011` | warning | nothing was checkable in this scope |

Every diagnostic carries: the stable code, a severity, a message, **evidence** (what was compared, what was found), and a **fix suggestion**. A diagnostic without a fix suggestion is a bug.

## Product boundaries

The three systems in this ecosystem each police their own domain — no cross-dependency:

| System | Command | Checks |
|--------|---------|--------|
| ACC | `acc check` | context/contract integrity (the ACC0xx registry) |
| ProAgents | `proagent validate --spec` | its agent-environment spec and lock |
| Workspace | `paw check` | the Workspace's own artifacts (the PAW0xx registry) |

`paw check` never reads ACC (`.acc/`) or ProAgents (`proagents.yaml`/`proagents.lock`) files: a cross-product check would couple three products' release cycles together. Its framework marker is Workspace-owned (`install/manifest.yaml`).

## Rules

- `paw check` never mutates anything — it reports; `paw install`/`paw init` repair.
- Framework checks run when the walked-up root declares `proagents.yaml`; workspace checks run when `.paw/` exists. The reported scope reflects what actually ran.
- The release checklist (`.acc/config/workflows/release.md`) treats `paw check` as a pre-publish blocking step — the registry exists precisely to make release drift impossible to miss.
