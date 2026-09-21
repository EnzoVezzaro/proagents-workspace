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