# ProAgents Workspace Documentation

The programmable workspace for AI agents.

## Overview

ProAgents Workspace is an open-source, agent-first execution environment where AI agents can work on real software. It provides agents with a controlled computer environment containing the resources required to inspect, modify, execute, test, and verify software.

## Documentation

### Getting Started

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Install, create a workspace, connect an agent, verify changes |
| [Agent Bootstrap](bootstrap.md) | One-line agent-installable setup: the six-stage init contract (spec 152) |
| [PAW Installation Runbook](paw-install-runbook.md) | AI-agent contract to install, set up, verify, and report a complete ProAgents Workspace |
| [Self-Diagnostics](health-checks.md) | `paw check`: PAW0xx-coded drift detection over the framework's own config (spec 153) |
| [Configuration](configuration.md) | Workspace definition, filesystem structure, reproducibility |
| [CLI Reference](cli-reference.md) | Every `paw` command, JSON output, structured errors, modes |
| [Agent Environment](agent-environment.md) | This repository's ProAgents setup — professions, crew, harness artifacts, regeneration |
| [Workspace Implementation](workspace-implementation.md) | The TypeScript kernel + plugin system in this repo — packages, bundled plugins, authoring a plugin |

### Concepts

| Document | Description |
|----------|-------------|
| [Product Model](product-model.md) | Ecosystem boundaries — ProAgents, ACC, Workspace |
| [Architecture](architecture.md) | Kernel, service registry, events, capability contracts |
| [Development Lifecycle](lifecycle.md) | The canonical phase flow (spec 151) + programmable lifecycle definitions |
| [Checkpoints and Gates](checkpoints.md) | The convergence architecture: attempt ≠ completion, gate plugins, DAG plans |

### Providers

| Document | Description |
|----------|-------------|
| [Runtime Providers](runtime-providers.md) | E2B, Docker, local — where the agent works |
| [Repository Providers](repository-providers.md) | GitHub, GitLab, generic Git — source of truth |
| [Context Providers](context-providers.md) | ACC, filesystem, language-server — what the agent understands |
| [Agent Providers](agent-providers.md) | Codex, Claude, OpenCode, Gemini, ProAgents — who works |

### Safety & Trust

| Document | Description |
|----------|-------------|
| [Security](security.md) | Permissions, approval policies, secrets, network, MCP, browser |
| [Protection Layer](protection.md) | Repo Shield — policy boundary around agent operations |
| [Verification](verification.md) | Verification provider, change verification, impact-aware checks |

### Distribution

| Document | Description |
|----------|-------------|
| [Distribution Layer](distribution.md) | reposell — licensing, packaging, marketplace |

## Ecosystem

| Component | Purpose |
|-----------|---------|
| **ProAgents** | Professional agent definitions |
| **ACC** | Agent context & code understanding |
| **ProAgents Workspace** | Execution environment (this project) |
| **Repo Shield** | Protection & security policies |
| **reposell** | Distribution, licensing & commerce |

## Design Principles

1. **Agent-first** - Primary consumer is an AI agent
2. **Runtime-neutral** - Works with Docker, E2B, Kubernetes, local, etc.
3. **Repository-neutral** - GitHub, GitLab, Bitbucket, Gitea, generic Git
4. **Context-neutral** - ACC, filesystem, language-server, tree-sitter, custom
5. **Agent-neutral** - Claude Code, Codex, OpenCode, Gemini CLI, custom agents
6. **Reproducible** - Workspace reconstructable from configuration