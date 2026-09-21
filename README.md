# ProAgents Workspace

## The programmable workspace for AI agents

ProAgents Workspace is an open-source, agent-first execution environment where AI agents can work on real software.

It provides agents with a controlled computer environment containing the resources required to inspect, modify, execute, test, and verify software.

It is designed to work with:

* ProAgents
* ACC
* Claude Code
* Codex
* OpenCode
* Gemini CLI
* DeepSeek Harness
* custom agents
* other compatible agent runtimes

The Workspace itself does not define the agent's profession or intelligence.

It provides the environment in which the agent operates.

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

The CLI should be the primary interface.

Command structure:

```text
paw
├── workspace
├── runtime
├── repository
├── context
├── agent
├── plugin
├── git
├── pr
├── exec
├── shell
├── terminal
├── service
├── secret
├── snapshot
├── verify
├── logs
└── config
```

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
npm install -g proagents-workspace
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
