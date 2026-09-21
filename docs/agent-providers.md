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

## ProAgents Integration (Official)

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