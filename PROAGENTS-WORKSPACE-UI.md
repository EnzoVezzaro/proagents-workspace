# ProAgents Workspace — UI & Desktop Product Specification

Supplement to `README.md` (see spec section 145). Structured like `DISTRIBUTION.md`: a supplement document at repository root, numbered sections, ASCII diagrams, distilled from the product specification. `README.md` remains canonical; this document expands the UI surface without contradicting it.

**Status:** Product/UI architecture · **Product:** ProAgents Workspace · **Type:** Desktop AI agent development environment

## 1. Product Definition

ProAgents Workspace is a professional desktop environment for working with AI coding agents. It is not another chat application. It is not a replacement for OpenCode, Claude Code, Codex, DeepSeek Harness, Gemini CLI, or other agent harnesses. It is the **workspace and orchestration layer above them**.

The Workspace allows a developer to:

- run multiple agents simultaneously
- use different harnesses for different agents
- connect agents to different projects or directories
- attach agents to independent terminals
- connect agents into crews
- create workflows between agents
- inspect exactly what each agent is doing
- inspect what each agent knows
- inspect what each agent changed
- observe terminal activity, tool calls, and context selection
- pause, resume, stop, restart, or fork agents
- move work between harnesses
- compare agent trajectories
- coordinate agents working on the same or related repositories
- create reusable agent configurations
- persist complete execution history

The central concept:

> **One Workspace → many Projects → many Agents → many Runtimes → many Terminals → many Harnesses.**

## 2. Product Mental Model

A traditional IDE has:

```text
Workspace
 ├── Projects
 ├── Files
 ├── Terminals
 ├── Git
 └── Extensions
```

ProAgents Workspace adds:

```text
Workspace
 ├── Projects
 │    ├── Agents
 │    ├── Crews
 │    └── Workflows
 │
 ├── Agent Runtimes
 │    ├── Harness
 │    ├── Model
 │    ├── Context
 │    ├── Terminal
 │    └── Session
 │
 ├── Shared Context
 ├── Event Stream
 ├── Git
 └── Integrations
```

The user should never have to think: *"Which terminal window did that agent run in?"* The Workspace answers this automatically.

## 3. Core Design Principle

Every running agent is a first-class **runtime entity**. An agent is not just a chat conversation. An Agent Runtime contains:

```text
Agent
 ├── Identity
 ├── Configuration
 ├── Harness
 ├── Model
 ├── Session
 ├── Terminal
 ├── Workspace
 ├── Project
 ├── Context
 ├── Tools
 ├── Permissions
 ├── Git state
 ├── Processes
 ├── Events
 └── Lifecycle
```

This allows the UI to represent agents from different systems uniformly:

```text
Agent A
  Harness: OpenCode
  Model: Claude
  Terminal: T1
  Project: frontend

Agent B
  Harness: DeepSeek Harness
  Model: DeepSeek
  Terminal: T2
  Project: backend

Agent C
  Harness: Codex
  Model: GPT
  Terminal: T3
  Project: infrastructure
```

All three appear as native ProAgents Workspace agents.

## 4. The Four Questions

The Workspace must always answer four questions. These define the UI architecture:

1. **What is the agent doing?** — current task, current step, current tool, current terminal command.
2. **Why is it doing it?** — plan, goal, context, dependencies, previous events.
3. **What does it know?** — files, symbols, documents, memories, tool results, injected context.
4. **What has it changed?** — files, git changes, commands, generated artifacts, environment changes.

## 5. Desktop Shell

Recommended architecture:

```text
Desktop Shell
      │
      ├── ProAgents UI
      ├── Workspace Controller
      ├── Agent Runtime Manager
      ├── Harness Adapters
      ├── Terminal Manager
      ├── Event Store
      └── Local Services
```

The UI should feel like **VS Code + an agent control room**, rather than "ChatGPT + file explorer".

## 6. Global Layout

```text
┌───────────────────────────────────────────────────────────────┐
│ Top Bar                                                       │
│ Workspace / Search / Command / Runtime Status / Account       │
├────────────┬──────────────────────────────────────┬───────────┤
│            │                                      │           │
│ Navigation │          Main Workspace              │ Inspector │
│            │                                      │           │
├────────────┴──────────────────────────────────────┴───────────┤
│ Runtime / Terminal / Event Status Bar                         │
└───────────────────────────────────────────────────────────────┘
```

The interface must support: resizing panels, collapsing panels, tabs, split views, detachable views, fullscreen views, keyboard navigation.

## 7. Primary Navigation

```text
WORKSPACE
 Overview
 Agents
 Crews
 Workflows
 Runs

PROJECTS
 Project A
 Project B
 Project C

DEVELOPMENT
 Files
 Git
 Terminals
 Context

RUNTIME
 Harnesses
 Tools
 Models
 Events

SYSTEM
 Registry
 Settings
```

The sidebar should be compact. The number of running agents is always visible:

```text
Agents                         7 ●

  ● API Refactor               2
  ● Frontend Agent             1
  ◐ Research Agent             1
  ○ Documentation Agent        2
```

Status indicators:

```text
● running    ◐ waiting    ○ idle    Ⅱ paused    ✓ completed    × failed
```

## 8. Top Bar

```text
[ Workspace ▼ ] [ ⌘K Search ] [ + New ]     [ 7 Running ] [ CPU ] [ Memory ]
```

When an agent is selected:

```text
[ ProAgents Workspace ]
API Refactor
● Running
OpenCode · Claude · terminal-04
[Pause] [Stop] [Fork] [...]
```

The top bar should never become a permanent chat composer. It is a workspace control surface.

## 9. Workspace Overview

The Overview is the control center. It answers: *What is happening across my entire development environment?*

```text
Good morning, Enzo.
7 agents running
3 projects active
2 workflows executing
1 approval required

────────────────────────────────────
ACTIVE WORK

┌─────────────────────────────────────┐
│ API Refactor              ● Running │
│ OpenCode · Claude                    │
│ backend/                             │
│ Implementing auth middleware         │
│ Step 14/31                           │
│ ████████████░░░░                     │
└─────────────────────────────────────┘
```

Below active work, recent activity:

```text
RECENT ACTIVITY
08:42 Agent changed auth.ts
08:41 Agent ran npm test
08:40 Agent spawned Test Agent
08:39 Context updated
08:38 Git branch created
```

## 10. Agents Page

The primary operational view. Supports list, grid, graph views; grouped by project, harness, status, or crew.

```text
Agents

[All] [Running] [Waiting] [Paused] [Completed]

Agent                 Harness             Project       Status
──────────────────────────────────────────────────────────────
API Refactor          OpenCode            Backend       ●
Frontend              DeepSeek Harness    Web           ●
Test Runner           Codex               Backend       ●
Research              Claude Code         Research      ◐
Docs                  OpenCode            Docs          ○
```

## 11. Agent Card

Every agent has a compact operational card. It must never hide the runtime relationship — the developer should immediately know **agent → harness → project → terminal**.

```text
┌─────────────────────────────────────────┐
│ ● API Refactor                          │
│                                         │
│ OpenCode · Claude                       │
│ ~/Projects/api                          │
│ terminal-04                             │
│                                         │
│ Implementing auth middleware            │
│ Step 14 · Tool: terminal.exec           │
│ 12m 31s        +4 files   +128 −34      │
│ [Open] [Pause] [...]                    │
└─────────────────────────────────────────┘
```

## 12. Agent Workspace

Opening an agent creates the main Agent Workspace:

```text
┌──────────────────────────────────────────────────────────────┐
│ API Refactor                                                 │
│ ● Running · OpenCode · Claude · terminal-04                  │
├──────────────────────────────────────────────────────────────┤
│ Goal   Implement authentication middleware and update tests. │
│ Plan   ✓ inspect existing auth                               │
│        ✓ identify middleware architecture                    │
│        ● implement middleware                                │
│        ○ update tests                                        │
│        ○ run integration suite                               │
├──────────────────────────────────────────────────────────────┤
│ Activity                                                     │
│ 14:31  Read src/auth/index.ts                                │
│ 14:32  Search "middleware"                                   │
│ 14:33  Edited src/auth/middleware.ts                         │
│ 14:34  npm test                                              │
└──────────────────────────────────────────────────────────────┘
```

## 13. Agent Tabs

```text
Overview · Chat · Trajectory · Plan · Context · Terminal · Files · Git · Tools · Events
```

Not every harness implements every tab. Tabs are **capability-driven**: if a harness exposes a trajectory, show Trajectory; if it exposes only terminal execution, show Terminal.

## 14. Chat

Chat remains available but is not the center of the product. The composer supports `@` references — files, agents, sessions, crews, context, commands:

```text
@src/auth  @agent:test-runner  @context:security
```

## 15. Trajectory

One of the most important surfaces. DeepSeek Harness treats trajectory as a first-class view over the event stream with inspect/resume/fork/search/replay; ProAgents retains that principle and expands it to **cross-runtime activity**.

Single-agent trajectory:

```text
GOAL
 │
 ├── Context
 ├── Model
 ├── Tool
 │    └── terminal.exec
 ├── Result
 ├── Model
 └── File change
```

Cross-agent trajectory:

```text
                    WORKFLOW
                       │
             ┌─────────┴─────────┐
             │                   │
        Agent A              Agent B
        OpenCode             Codex
             │                   │
        inspect API          inspect tests
             │                   │
             └─────────┬─────────┘
                       │
                    Agent C
                DeepSeek Harness
                       │
                 integration test
```

## 16. Global Trajectory

A global trajectory view — different from a single session's trajectory — shows the operational history of the Workspace:

```text
10:31 Agent A started
10:32 Agent B started
10:33 Agent A edited auth.ts
10:34 Agent B detected auth.ts change
10:35 Agent C spawned
10:36 Agent C ran integration tests
10:37 Agent B completed
```

## 17. Multi-Agent Graph

Graph view. Nodes: agents, crews, workflows, terminals, projects, context sources, harnesses. Edges: spawned-by, depends-on, communicates-with, shares-context-with, shares-project-with, produces-for, blocked-by, follows.

```text
             ┌──────────────┐
             │ API Project  │
             └──────┬───────┘
                    │
          ┌─────────┴─────────┐
          │                   │
     ┌────▼────┐         ┌────▼────┐
     │ Agent A │         │ Agent B │
     │ OpenCode│         │ Codex   │
     └────┬────┘         └────┬────┘
          │                   │
     terminal-01         terminal-02
          │                   │
          └────────┬──────────┘
                   │
              ┌────▼────┐
              │ Agent C │
              │ DSH     │
              └─────────┘
```

## 18. Terminals — First-Class Objects

A major difference from traditional agent UIs. The Workspace maintains a **Terminal Registry**:

```text
TERMINALS

● terminal-01
  Agent: API Refactor
  Harness: OpenCode
  ~/Projects/api

● terminal-02
  Agent: Test Runner
  Harness: Codex
  ~/Projects/api

○ terminal-04
  Shell
  ~/Projects
```

Registry fields: Terminal ID, Process, Shell, Directory, Agent, Harness, Status, Environment.

## 19. Terminal View

Tabs and splits; the terminal is connected to the agent runtime:

```text
Terminal
  ↕
Agent
  ↕
Harness
  ↕
Session
```

## 20. Terminal Ownership

Every terminal has an owner: `human | agent | crew | workflow | system`.

```text
terminal-07
owner: agent:test-runner
```

If an agent starts a process, the UI knows which agent created it. No ambiguity.

## 21. Harnesses as Adapters

Harnesses are runtime adapters (spec section 144). The Workspace understands the adapter contract, not each harness internally:

```ts
interface HarnessAdapter {
  id: string
  detect(): Promise<boolean>
  install(): Promise<void>
  start(config: RuntimeConfig): Promise<Runtime>
  stop(runtimeId: string): Promise<void>
  pause(runtimeId: string): Promise<void>
  resume(runtimeId: string): Promise<void>
  send(runtimeId: string, input: Input): Promise<void>
  events(runtimeId: string): AsyncIterable<ProAgentsEvent>
  capabilities(): HarnessCapabilities
}
```

## 22. Harness Manager

```text
Harnesses
────────────────────────────────────────────
OpenCode
● Installed · Version 1.x · 8 active runtimes

Claude Code
● Installed · Version x.x · 2 active runtimes

DeepSeek Harness
● Installed · Developer Preview · 3 active runtimes

Codex
● Installed · 1 active runtime
────────────────────────────────────────────
[ + Add Harness ]
```

Each harness displays: version, installation path, availability, capabilities, active agents, configuration, environment, logs.

## 23. Harness Capabilities

Machine-readable capabilities; the UI adapts itself to them:

```ts
interface HarnessCapabilities {
  sessions: boolean
  trajectory: boolean
  streaming: boolean
  tools: boolean
  terminal: boolean
  subagents: boolean
  approvals: boolean
  planning: boolean
  fork: boolean
  replay: boolean
  contextInjection: boolean
  lifecycleHooks: boolean
}
```

## 24. Agent Runtime

The fundamental runtime object:

```ts
interface AgentRuntime {
  id: RuntimeId
  agentId: AgentId
  harnessId: HarnessId
  projectId: ProjectId
  terminalId?: TerminalId
  sessionId: SessionId
  status: RuntimeStatus
  model?: ModelRef
  capabilities: RuntimeCapabilities
  startedAt: Date
  pid?: number
}
```

Status: `starting · running · waiting · paused · blocked · stopping · stopped · completed · failed · crashed`.

## 25. Event Architecture

Everything visible in the Workspace is event-driven. Core event:

```ts
interface ProAgentsEvent {
  id: string
  timestamp: number
  workspaceId: string
  projectId?: string
  agentId?: string
  runtimeId?: string
  terminalId?: string
  harnessId?: string
  type: string
  source: string
  data: unknown
}
```

Event families (illustrative): `runtime.started/stopped`, `agent.created/started/paused/completed/failed`, `session.started/message/completed`, `tool.started/completed/failed`, `terminal.created/command/output/exit`, `file.read/changed`, `context.selected/injected`, `git.branch.created/commit.created`, `agent.spawned/message`, `workflow.started/step.started/step.completed`.

## 26. Event Store

Durable event history, following the event-sourced principle DeepSeek Harness uses — the log is the authoritative record, views derive from it. ProAgents expands this from session-scope to workspace-scope:

```text
Workspace
   ↓
Events
   ├── Agent
   ├── Runtime
   ├── Terminal
   ├── Harness
   ├── Project
   ├── Workflow
   └── Context
```

This enables replay, debugging, timeline, auditing, crash recovery, resume, fork, and historical inspection.

## 27. Context Inspector

The Context tab answers: *Why did the agent know this?*

```text
CONTEXT

Prompt
"Implement authentication middleware"

Selected files
  src/auth/index.ts
  src/auth/middleware.ts
  src/server.ts

Referenced symbols
  AuthService · Middleware · Session

Rules
  AGENTS.md · project.instructions.md

Previous context
  Session #42

Injected by
  ProAgents ACC
```

Every context item exposes: source, reason, timestamp, provider, token cost, relevance.

## 28. Layer Separation

```text
Harness     — "How does the agent execute?"
ProAgents   — "What should the agent do?"
ACC         — "What does the agent need to know?"
```

The Workspace makes this relationship visible in the UI.

## 29. Context Timeline

Context changes appear in the trajectory. The user can inspect the exact context used for any model call:

```text
14:03 Context selected      src/auth/index.ts
14:04 Context expanded      AuthService
14:05 Context injected      AGENTS.md
14:06 Model request
14:07 Tool call             terminal.exec
```

## 30. Agent Builder

Creating an agent should feel like configuring a development environment:

```text
Create Agent

Identity       Name: API Refactor
Harness        OpenCode
Model          Claude
Project        ~/Projects/api
Terminal       Create automatically
Context        ACC: [✓] Repository  [✓] Git history  [✓] Project instructions
Permissions    [✓] Read files  [✓] Edit files  [✓] Terminal  [ ] Network
Behavior       Plan before execution [✓]   Auto-commit [ ]
────────────────────────────
[Create Agent]
```

## 31. Agent Configuration as Code

Every agent has a portable specification — agent configuration must not be trapped inside the UI:

```yaml
name: api-refactor
harness:
  type: opencode
model:
  provider: anthropic
  model: claude
workspace:
  path: ./api
terminal:
  shell: zsh
context:
  provider: acc
permissions:
  filesystem: project
  terminal: true
  network: false
behavior:
  planning: true
  auto_commit: false
```

## 32. Crews

A Crew is a persistent group of agents. Each member can use a different harness:

```text
Backend Crew

Lead       → Claude Code
API        → OpenCode
Database   → Codex
Testing    → DeepSeek Harness
Security   → OpenCode
```

The Crew view displays this as a graph.

## 33. Crew Communication

Agents communicate through explicit channels — shared context, messages, artifacts, tasks, dependencies. Communication is visible in the timeline:

```text
API Agent
   │  "Auth middleware changed"
   ▼
Test Agent
   │  runs tests
   ▼
Lead Agent
```

## 34. Workflows

Deterministic orchestration. Each node can run on a different agent/harness:

```text
Research        → DeepSeek Harness
Implement       → OpenCode
Test            → Codex
Review          → Claude Code
```

## 35. Workflow Editor

Visual workflow builder:

```text
┌─────────────┐
│ Research    │
│ DSH         │
└──────┬──────┘
       ▼
┌─────────────┐
│ Implement   │
│ OpenCode    │
└──────┬──────┘
       ├───────────────┐
       ▼               ▼
┌───────────┐     ┌───────────┐
│ Tests     │     │ Security  │
│ Codex     │     │ Claude    │
└─────┬─────┘     └─────┬─────┘
      └────────┬────────┘
               ▼
        ┌─────────────┐
        │ Review      │
        │ OpenCode    │
        └─────────────┘
```

## 36. Shared Projects

Multiple agents may work in the same directory, same repository, different worktrees, different branches, or different machines. The Workspace makes this **explicit**:

```text
Project: API

Agent A   branch: feature/auth    worktree: /api-auth
Agent B   branch: feature/tests   worktree: /api-tests
Agent C   branch: main            worktree: /api
```

This prevents agents from unknowingly overwriting one another.

## 37. Git Surface

```text
Branch: feature/auth

Changes
 M src/auth.ts
 M src/session.ts
 A tests/auth.test.ts

Agents
API Refactor → 3 changes
Test Agent   → 1 change
```

## 38. Agent Attribution of Changes

Every file change is attributable:

```text
src/auth.ts
Changed by:  API Refactor
Runtime:     runtime-42
Harness:     OpenCode
Session:     session-918
Time:        14:31
Agent reason: Implement middleware
```

This is essential for multi-agent development.

## 39. Run History

Runs are persistent executions; each can be opened, replayed, forked, resumed, exported, compared:

```text
RUNS

API Refactor        Sep 22 · 14:21   Completed   32 steps · 14 files · 2h 12m
Frontend Build      Sep 22 · 13:02   Completed   47 steps · 21 files
Security Review     Sep 21 · 19:43   Failed      Approval timeout
```

## 40. Fork

Forking creates a new runtime from an existing execution state:

```text
Run #102
                     ┌── Original
                     │
checkpoint ──────────┤
                     │
                     └── Fork
                         New agent · New harness · New model
```

This enables: *"What happens if I give this trajectory to another harness?"*

## 41. Cross-Harness Handoff

The Workspace packages relevant state — goal, plan, context, artifacts, files, git state, previous trajectory, agent messages — and initializes the new runtime:

```text
Agent A (OpenCode · Claude) → Agent B (DeepSeek Harness · DeepSeek) → Agent C (Codex · GPT)
```

The user chooses: `[Continue] [Clone] [Fork] [Handoff] [Summarize + Handoff]`.

## 42. Agent Control Room

Operational dashboard — the developer's system monitor for AI agents:

```text
AGENT CONTROL ROOM

CPU 43% · Memory 5.2 GB
Agents 8 · Running 6 · Waiting 1 · Blocked 1

RUNTIME
API Agent         ●  14m
Frontend          ●  31m
Tests             ●  4m
Research          ◐  21m
Security          ●  8m

APPROVALS
1 agent waiting for permission

ERRORS
terminal-04 exited with code 1
```

## 43. Approvals

Approval requests are global and show: agent, project, harness, terminal, command, reason, risk, affected files:

```text
Agent: API Refactor · Harness: OpenCode

The agent wants to execute:
rm -rf ./generated

[Allow Once] [Allow for Session] [Deny]
```

## 44. Notifications

Operational, not decorative:

```text
API Refactor completed
32 steps · 14 files changed · Tests passing · 1 commit created
```

Important notifications: agent completed/failed/blocked, approval required, workflow failed, terminal crashed, merge conflict, context unavailable, harness disconnected.

## 45. Search

Global search over agents, sessions, runs, events, files, projects, terminals, crews, workflows, tools, context:

```text
⌘K  "authentication middleware"

Agents   API Refactor
Files    src/auth/middleware.ts
Runs     API Refactor · Sep 21
Events   tool/call · npm test
```

## 46. Command Palette

`⌘K` — contextual commands: New Agent/Crew/Workflow, Open Terminal, Start/Pause/Stop/Fork/Handoff Agent, Attach Harness, Open Trajectory/Context/Git, Run Workflow, Search Events, Open Registry.

## 47. Registry

The reusable component catalog — agents, crews, workflows, skills, tools, context providers, harness adapters, templates:

```text
Security Reviewer
Crew template · Claude Code · OWASP skill · Git integration · Security context
[Install]
```

The Registry is infrastructure for extending the Workspace, not the main surface.

## 48. Agent Templates

```text
Create Agent → Select Template → Customize → Create Runtime
```

Templates: Frontend Developer, Backend Developer, Code Reviewer, Security Auditor, Researcher, QA Engineer, Documentation Agent, DevOps Agent, Data Agent.

## 49. Settings

Organized by system: General, Appearance, Workspace, Projects, Harnesses, Models, Terminals, Context, Permissions, Git, Tools, Notifications, Keyboard, Storage, Advanced.

## 50. Runtime Inspector

Every runtime has a low-level inspector: runtime id, agent, harness, PID, terminal, working directory, model, session, status, started, event count. Advanced users can inspect: environment variables, process tree, stdin/stdout, event stream, hooks, tool registry, context, permissions, network, filesystem.

## 51. Lifecycle Inspector

The UI exposes the normalized runtime lifecycle (spec section 144):

```text
runtime.start → session.start → prompt.before → context.before →
model.before → model.after → tool.before → tool.after →
file.before → file.after → session.idle → session.stop → runtime.stop
```

Particularly useful for developers building ProAgents integrations.

## 52. Developer Mode

Reveals event IDs, runtime IDs, session IDs, process IDs, plugin IDs, hook execution, latency, token usage, context size, tool duration, model requests. The default UI remains clean.

## 53. Performance View

Per-runtime: model latency, tool latency, terminal latency, context generation, tokens, cost, CPU, memory, network:

```text
API Refactor

Model     Requests 41 · Input 182k · Output 34k
Tools     Calls 123 · Avg duration 1.4s
Context   Avg size 18k · ACC queries 41
```

## 54. Cross-Agent Comparison

Select multiple agents and compare steps, tool calls, files changed, context, duration, errors, tokens, trajectory. Not a ranking system — an inspection/debugging tool.

## 55. Workspace Activity Feed

```text
14:42:10  API Agent edited src/auth.ts
14:42:08  Test Agent started npm test
14:41:57  Frontend Agent received handoff
14:41:31  Security Agent requested approval
14:41:12  Workflow "Release" entered Review
```

Clicking an event opens its source runtime.

## 56. Cross-Agent Event Correlation

Events are correlated into inspectable chains:

```text
Agent A edited auth.ts
     ├── Git event
     ├── Context invalidation
     └── Agent B notified
              └── Agent B reruns tests
```

## 57. Shared Context Bus

Agents publish artifacts — file, patch, report, decision, research, test result, build result, schema, API specification — through shared context:

```text
Agent A → Artifact → Shared Context → Agent B
```

## 58. Agent-to-Agent Messaging

Explicit, and part of the event history:

```text
API Agent → Test Agent
"Auth middleware is implemented. Please update integration tests."
```

## 59. Agent Status Model

`RUNNING · WAITING · BLOCKED · PAUSED · IDLE · COMPLETED · FAILED · CRASHED`

Important distinction: **Waiting ≠ idle.** Waiting means the runtime is alive but waiting for an external condition. Blocked means it cannot continue.

## 60. Workspace Persistence

Closing the application must not terminate agents unless explicitly configured:

```text
Close Window
6 agents are still running.
[Keep Running] [Stop All] [Cancel]
```

The application can restart and reconnect to existing runtimes.

## 61. Crash Recovery

```text
Workspace restarts → Discover runtimes → Reconnect terminals →
Replay event stream → Restore UI state
```

This is why the runtime/event model must be independent from the UI layer.

## 62. Desktop Architecture

```text
┌───────────────────────────────────────┐
│ Desktop Shell (Tauri)                 │
├───────────────────────────────────────┤
│ ProAgents UI (React)                  │
├───────────────────────────────────────┤
│ Workspace Runtime (TypeScript / Node) │
├───────────────────────────────────────┤
│ Runtime Manager                       │
├──────────┬──────────┬─────────────────┤
│ OpenCode │ Codex    │ DeepSeek        │
│ Adapter  │ Adapter  │ Harness Adapter │
├──────────┴──────────┴─────────────────┤
│ Terminal / Process Layer              │
├───────────────────────────────────────┤
│ Event Store                           │
└───────────────────────────────────────┘
```

## 63. UI State Architecture

Do not make UI state the source of truth:

```text
Runtime → Event Store → Domain Models → UI projections → UI
```

This allows replay, reconnect, multiple UI views, persistence, debugging, remote runtimes, and future collaboration.

## 64. View Model

The UI consumes normalized projections and never understands harness internals directly:

```ts
interface AgentViewModel {
  id: string
  name: string
  status: AgentStatus
  harness: HarnessViewModel
  project: ProjectViewModel
  terminal?: TerminalViewModel
  currentTask?: TaskViewModel
  activity: ActivityItem[]
}
```

## 65. Harness Adapter Boundary

```text
                ProAgents Workspace
                         │
                  Harness Adapter
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       OpenCode         Codex       DeepSeek
          │              │              │
       runtime        runtime        runtime
```

Each adapter converts native harness events into ProAgents events.

## 66. DeepSeek Harness Integration

DeepSeek Harness is especially compatible: it already exposes plugin-oriented capabilities, event streams, sessions, trajectory, workspace concepts, and subagent integration points. Integrate as:

```text
ProAgents
    │
    └── DeepSeekHarnessAdapter
             │
             ├── sessions
             ├── events
             ├── trajectory
             ├── tools
             ├── subagents
             └── runtime
```

Do not fork the harness UI unless necessary. Treat the harness as a runtime.

## 67. Uniform Adapter Model

```text
ProAgents
    ├── OpenCodeAdapter
    ├── CodexAdapter
    ├── ClaudeCodeAdapter
    ├── DeepSeekHarnessAdapter
    └── CustomHarnessAdapter
```

The user sees one Workspace; the underlying execution environment can be completely different.

## 68. Visual Language

**Technical, calm, dense, dark-first, professional.**

Avoid: giant gradients, oversized marketing typography, excessive rounded cards, chatbot bubbles, decorative AI graphics, excessive animations.

Prefer: compact typography, subtle borders, clear hierarchy, status indicators, monospace for runtime information, dense tables, timelines, graphs, terminal surfaces, restrained motion.

## 69. Color Semantics

Color represents state, not decoration:

```text
green   running / healthy       yellow  waiting / approval
orange  warning                 red     failed / blocked
blue    informational           gray    inactive
```

Never color alone: always combine with icon, label, status.

## 70. Typography

Two primary type systems:

```text
UI:         Inter / Geist / system sans
Technical:  JetBrains Mono / Geist Mono
```

Technical data is monospace: `runtime-83291 · session-19283 · terminal-04 · PID 18392`.

## 71. Motion

Motion communicates causality (agent starts, workflow node activates) — never decorative loops.

## 72. Responsive Behavior

Desktop-first, minimum 1280 × 800. At smaller sizes: right inspector collapses, bottom terminal becomes a tab, sidebar collapses. No horizontal scrolling.

## 73. Keyboard First

```text
⌘K ⌘P ⌘⇧A ⌘⇧C ⌘⇧W ⌘J ⌘B ⌘⇧B ⌘Enter Esc
```

Users must be able to operate the Workspace without a mouse.

## 74–75. Quick Actions

Per-agent: Open, Pause, Resume, Stop, Restart, Fork, Clone, Handoff, Attach Terminal, Open Context/Trajectory/Git/Logs/Runtime. Global: New Agent/Crew/Workflow/Project, Open Terminal, Run Workflow, Search, Connect Harness, Import/Export Agent.

## 76. Information Hierarchy

Priority order — never show raw event data before operational information:

```text
1. Current state          6. Terminal
2. Current task           7. Context
3. Current action         8. History
4. Project                9. Raw technical data
5. Harness
```

## 77. Progressive Disclosure

```text
Default:        API Refactor ● Running — Implementing authentication middleware — OpenCode · Claude
Expanded:       Step 14/31 · terminal-04 · PID 18391 · Context 17.2k tokens · Tool terminal.exec
Developer Mode: event=tool/call seq=12839 runtime=rt-9182 session=s-1828
```

## 78. Empty States

Useful empty states with the action that resolves them: `[Create Agent]`, `[Add Project]`, `[Connect Harness]`.

## 79. Error States

Errors explain what happened, why, what is affected, what can be done:

```text
Harness disconnected

OpenCode stopped responding.
Affected: API Refactor. The session is preserved.

[Reconnect] [Restart Runtime] [Open Session]
```

## 80. Security Model

Each runtime has explicit capabilities — filesystem, terminal, network, git, secrets, browser, external APIs — surfaced at agent level:

```text
API Agent
Filesystem  Project      Terminal  Allowed
Network     Blocked      Git       Allowed
Secrets     None
```

## 81. Runtime Isolation

Shared terminal, isolated terminal, shared filesystem, worktree, container, sandbox, remote runtime — these are **runtime configuration**, not special cases.

## 82. Remote Agents

Future architecture allows local and remote agents in one workspace; the UI makes location visible (`● Local · ● Remote · NYC`).

## 83. Agent Detail Header

Persistent across the agent's tabs:

```text
● API Refactor
Implement authentication middleware
OpenCode · Claude · ~/Projects/api · terminal-04
[Pause] [Stop] [Fork] [...]
```

## 84. Contextual Right Panel

The right panel changes with the selected object: Agent (status/harness/model/project/terminal/permissions), Tool (input/output/duration/files/exit code), File (changed-by/agent/runtime/diff), Event (source/runtime/timestamp/payload/related events).

## 85. Bottom Runtime Bar

```text
● 6 agents running │ terminal-04 │ CPU 43% │ Memory 5.2GB │ 2 approvals
```

Clicking expands the Runtime Control Center.

## 86. Runtime Control Center

```text
RUNTIME CONTROL CENTER
Agents     Terminals     Processes     Approvals

API Agent   OpenCode   terminal-04   PID 18391   ● Running
Test Agent  Codex      terminal-05   PID 19382   ● Running
```

## 87. Session Model

`Workspace → Agent → Runtime → Session`. A session records messages, tool calls, tool results, context, plans, approvals, files, runtime events — inspectable independently of the UI.

## 88. Session Views

The same session has multiple projections: Chat, Trajectory, Timeline, Raw Events, Summary.

## 89. Workspace as Event Graph

```text
                    WORKSPACE
                        │
        ┌───────────────┼────────────────┐
        │               │                │
     PROJECTS         CREWS           WORKFLOWS
        │               │                │
     AGENTS ───────── AGENTS ───────── AGENTS
        │
     RUNTIMES
        │
     SESSIONS
        │
     TERMINALS
        │
      EVENTS
```

The conceptual foundation of the product.

## 90. The Most Important UI Rule

Never make the user infer relationships. If an agent is running a command, show agent + harness + model + terminal + path + command — not "Running…". If an agent changed a file, show who, on what runtime, which file. If an agent is waiting, show what it waits for.

## 91–93. Delivery Phases

**MVP:** workspace/project management, agent list + lifecycle control, adapter architecture (OpenCode, DeepSeek Harness, one more), terminal creation/attachment/streaming/ownership, session event stream + chat + trajectory, context inspector + ACC integration point, git surface + agent attribution, command palette.

**Phase 2:** crews, workflows, graph view, cross-agent messaging, handoff, fork, run comparison, registry, templates, advanced permissions.

**Phase 3:** remote agents, distributed runtimes, collaborative workspaces, remote terminals, agent marketplace, automated orchestration, cross-machine execution, advanced telemetry.

## 94. Product Architecture Summary

```text
                         PROAGENTS WORKSPACE
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                WORKSPACE                  EVENT STORE
                    │                           │
          ┌─────────┼─────────┐                 │
          │         │         │                 │
       Projects   Crews   Workflows             │
          │         │         │                 │
          └─────────┼─────────┘                 │
                    │                           │
                  Agents                        │
                    │                           │
                 Runtimes ──────────────────────┤
                    │                           │
        ┌───────────┼────────────┐              │
        │           │            │              │
     Harness      Model       Terminal          │
        │           │            │              │
    OpenCode      Claude      terminal-01       │
    Codex         GPT         terminal-02       │
    DSH           DeepSeek    terminal-03       │
        │           │            │              │
        └───────────┼────────────┘              │
                    │                           │
                  Session ──────────────────────┘
                    │
              ┌─────┴─────┐
              │           │
            Chat      Trajectory
              └─────┬─────┘
                    │
                  Context
                    │
                   ACC
```

## 95. Final Product Principle

DeepSeek Harness demonstrates a strong model: *everything is a plugin, every run is traceable*. ProAgents Workspace evolves it:

> **Everything is a runtime. Every agent is observable. Every execution is traceable. Every harness is interchangeable. Every terminal is addressable. Every agent can connect to another agent.**

The fundamental ProAgents abstraction is **Runtime**, not Chat. The fundamental UI abstraction is **Workspace**, not Conversation.

A developer opening ProAgents Workspace sees, at a glance: what is running, who is running it, where, on which harness, what it knows, what it is doing, what it has changed, what it waits for, and which other agents it is connected to. That is the core UX identity of ProAgents Workspace — and what distinguishes it from DeepSeek Harness: **DeepSeek Harness is the agent runtime/harness; ProAgents Workspace is the multi-runtime operating environment that supervises and connects DeepSeek Harness, OpenCode, Codex, Claude Code, and others.**
