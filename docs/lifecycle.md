# Development Lifecycle

## Core Concept: Programmable Lifecycle Steps

The key change: **verification should not be a single final step**. The Workspace supports a programmable, extensible **development lifecycle loop** where additional validation stages can be inserted depending on the project, agent, risk level, or Workspace profile.

## Lifecycle Steps

```
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

Each step is independently composable:

```
                 DEVELOPMENT LIFECYCLE
                         │
                         ▼
              ┌──────────────────────┐
              │    Step Registry     │
              └──────────┬───────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
       Test Step     Browser Step   Security Step
           │             │             │
           ▼             ▼             ▼
        Vitest         Chromium       Semgrep
        Playwright     Firefox        SAST
        Custom         Safari         Dependency
           │             │             │
           └─────────────┼─────────────┘
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

## Programmable Lifecycle Configuration

A Workspace profile defines its own lifecycle:

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

## Project-Specific Loops

Different projects define different loops:

```
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

## Implemented Lifecycle Model (v0.1)

The lifecycle is a first-class configuration surface in `workspace.yaml`, validated by `@proagents/contracts` and executed by the kernel's `LifecycleRunner`:

```yaml
lifecycle:
  definitions:
    - id: web-app
      name: Web application lifecycle
      stages:
        - id: implement
          name: Implement
          type: implement          # understand|plan|implement|test|review|ship|custom
          agents:
            - profileId: nodejs-engineer
              role: implementer
          tools:
            - id: terminal
              type: terminal
            - id: git
              type: git
          policy:
            required: true          # a failed required stage fails the run
            onFailure: stop         # stop | retry | continue
            maxRetries: 1           # retry budget when onFailure: retry
            timeoutMs: 600000       # per-stage wall-clock budget (optional)
        - id: test
          name: Test
          type: test
          tools: [{ id: vitest, type: vitest }]
          policy: { required: false, onFailure: continue }
  default: web-app                   # used when a workspace names no lifecycle

workspaces:
  flight-booking:
    root: agents/flight-booking
    lifecycle: { ref: web-app }      # or an inline definition
```

Execution semantics:

- Stages run in declaration order; `parallel: true` is **advisory** in this milestone (reported honestly, not hidden behind fake concurrency).
- Stage execution is delegated to an injected `StageExecutor` — the kernel provides sequencing, policies, and events; it never spawns agents or runs tools itself (kernel purity, spec section 139).
- Per-stage progress flows over the typed event bus: `lifecycle/stage-started`, `lifecycle/stage-completed`, `lifecycle/completed`. The UI Lifecycle Inspector (see `PROAGENTS-WORKSPACE-UI.md` section 51) is a pure projection over these events.
- A lifecycle run resolves the workspace's entry (`lifecycle.inline` preferred, then `lifecycle.ref`, then the top-level `lifecycle.default`); an unknown ref is a structured `CONFIG_INVALID` error.