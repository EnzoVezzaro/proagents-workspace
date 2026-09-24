# Agent Providers

## Agent Provider Contract

```typescript
interface AgentProvider {
  detect(): Promise<boolean>;
  start(workspace: Workspace, options: AgentStartOptions): Promise<AgentSession>;
  stop(sessionId: string): Promise<void>;
  status(sessionId: string): Promise<AgentStatus>;
}
```

## Official Integrations

- Claude Code
- Codex
- OpenCode
- Gemini CLI
- DeepSeek Harness
- Custom CLI agents
- ACP-compatible agents
- MCP-based agents

## Detection and Integration Tiers (convention-first)

Agent integration is ENVIRONMENT DISCOVERY, not a hard-coded registry: `paw agent list` resolves declared integration probes (binary on PATH, well-known configuration files) and reports each detected agent with its honest integration tier (spec section 148):

```text
Tier 0  detect       the agent was found on this machine
Tier 1  environment  conventions/config available to the agent in this workspace
Tier 2  process      the workspace can launch the agent (current CLI adapters)
Tier 3  native       native hooks/plugin APIs (only when actually supported)
```

A process adapter never reports itself as native. Adding a new agent is a new declaration/plugin — never a new conditional in the kernel (spec sections 139/146).

### Research handoff (spec section 149)

`paw research` writes `.paw/proagents/requirements.json` — the product/environment requirements (detected languages, runtime, package manager, verification commands, context providers, detected agents) handed to the ProAgents layer. ProAgents owns the professional-agent interview (role, skills, rules, crews); Workspace owns the product/environment interview. The two artifacts converge instead of competing. See [Agent Environment](agent-environment.md) for this repository's own ProAgents setup.

## ProAgents Integration (Official)

This repository consumes this integration itself: its professions, capabilities, and policies are declared in `proagents.yaml` and compiled into harness artifacts. See [Agent Environment](agent-environment.md) for the concrete setup and regeneration pipeline.

### Configuration

```yaml
agent:
  provider: proagent
  profile:
    source: ./software-engineer.agent.yaml
```

### Profile Requirements

A ProAgent profile may request:

```
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

## Agent Workspace Contract

A ProAgent can ask Workspace for:

```
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

The agent does not need to know which underlying implementation provides them.