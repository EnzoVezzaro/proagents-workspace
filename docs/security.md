# Security

## Core Principle

Security is a core product requirement. The Workspace must explicitly control:

```
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

## Permissions (Declarative)

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

## Approval Policies

### Autonomous

```yaml
approval:
  mode: autonomous
```

### Confirm Dangerous Actions

```yaml
approval:
  mode: guarded
```

### Human-Controlled

```yaml
approval:
  mode: manual
```

## Dangerous Operations

- Destructive filesystem operations
- Credential access
- Network changes
- Force push
- Repository deletion
- Production deployments

## Git Safety

Never allow an agent to accidentally destroy repository history.

Policies for:
- Force push
- Branch deletion
- `reset --hard`
- `clean -fd`
- Tag deletion
- Remote changes

Default behavior is conservative.

## Secrets Management

Never place secrets directly into source code or Workspace configuration files.

```typescript
interface SecretsProvider {
  resolve(reference: SecretReference): Promise<SecretValue>;
  inject(workspace: Workspace, references: SecretReference[]): Promise<void>;
}
```

### Providers

- Environment variables
- Local keychain
- 1Password
- Vault
- AWS Secrets Manager
- GCP Secret Manager
- Azure Key Vault
- Custom

Secrets preferably injected at runtime.

## Network Security

Networking must be explicit.

```typescript
interface NetworkProvider {
  allow(request: NetworkRule): Promise<void>;
  deny(request: NetworkRule): Promise<void>;
  inspect(): Promise<NetworkPolicy>;
}
```

```yaml
network:
  mode: restricted
  allow:
    - registry.npmjs.org
    - github.com
    - api.example.com
```

Modes: `allowlist`, `denylist`, `offline`, `restricted`, `unrestricted`.

The security model must be visible to the user.

## MCP Security

MCP is an integration layer rather than a hard-coded feature.

```yaml
mcp:
  servers:
    - name: browser
      provider: browser-mcp
    - name: database
      provider: postgres-mcp
```

MCP credentials and permissions governed by Workspace policy.

## Browser Security

Browser access is optional.

```typescript
interface BrowserProvider {
  launch(): Promise<BrowserSession>;
  navigate(session: string, url: string): Promise<void>;
  screenshot(session: string): Promise<Buffer>;
  close(session: string): Promise<void>;
}
```

Implementations: Playwright, Chromium, Browserbase, E2B browser, custom.

## Protection Layer Integration

The Protection layer (Repo Shield) provides an additional security boundary:

- Shell command protection
- Git operation protection
- MCP operation protection
- Network request protection
- File operation protection

See [Protection Documentation](protection.md) for details.