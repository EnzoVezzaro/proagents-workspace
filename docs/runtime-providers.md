# Runtime Providers

## Runtime Provider Contract

```typescript
interface RuntimeProvider {
  create(config: RuntimeConfig): Promise<RuntimeInstance>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  exec(id: string, request: ExecRequest): Promise<ExecResult>;
  getFilesystem(id: string): Promise<FilesystemHandle>;
  getNetwork(id: string): Promise<NetworkHandle>;
  snapshot?(id: string, options?: SnapshotOptions): Promise<Snapshot>;
  restore?(snapshot: Snapshot): Promise<RuntimeInstance>;
  inspect(id: string): Promise<RuntimeInspection>;
}
```

## Supported Runtimes

### E2B (Recommended for Cloud)

```yaml
runtime:
  provider: e2b
```

Features:
- Workspace creation
- Command execution
- Filesystem access
- Environment variables
- Networking
- Package installation
- Long-running processes
- Snapshots
- Lifecycle management
- Resource configuration

The E2B SDK remains behind the runtime contract. The rest of Workspace does not import E2B directly.

### Docker (Local Isolated)

```yaml
runtime:
  provider: docker
  image: node:22
```

Supports:
- CPU limits
- Memory limits
- Disk limits
- Environment variables
- Volumes
- Ports
- Network policy
- Process lifecycle
- Image selection

```bash
paw workspace create --runtime docker --image node:22
```

### Local (Host Machine)

```yaml
runtime:
  provider: local
```

```bash
paw workspace create --runtime local
```

Exposes:
- Filesystem
- Shell
- Terminal
- Git
- Processes
- Network
- Ports
- Environment

**Security model is clearly reported:**

```
Runtime: local
Isolation: host-level
Network: unrestricted
```

Do not present local execution as equivalent to a sandbox.

### Additional Providers (Future)

- Kubernetes
- Firecracker
- Daytona
- Remote VM
- Custom infrastructure

## Runtime Selection

Configuration-driven:

```yaml
runtime:
  provider: e2b
```

```yaml
runtime:
  provider: docker
```

```yaml
runtime:
  provider: local
```