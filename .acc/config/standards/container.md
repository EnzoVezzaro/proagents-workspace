# container.md — Container & Runtime Standard

The Docker/container standard for ProAgents Workspace. Grounded in spec sections 10–14, 62–63, 101–102, and `docs/runtime-providers.md`.

## Runtime Contract First

Every runtime implements the `RuntimeProvider` contract:

```typescript
create(config: RuntimeConfig): Promise<RuntimeInstance>;
start(id) · stop(id) · destroy(id)
exec(id, request): Promise<ExecResult>;
getFilesystem(id) · getNetwork(id)
snapshot?(id, options) · restore?(snapshot)
inspect(id): Promise<RuntimeInspection>;
```

Docker specifics live in the Docker provider plugin. The kernel imports nothing from Docker.

## Docker Runtime Rules (spec section 14)

- **Image selection is configuration-driven** (`runtime.image: node:22`); pin images by tag in examples; document that users may pin by digest.
- **Resource limits are honored exactly as declared**: CPU limits, memory limits, disk limits. If the runtime cannot enforce a limit, report it — never silently omit.
- **Volumes, ports, environment variables** map 1:1 from the workspace configuration.
- **Network policy is enforced by the runtime**: restricted mode must actually restrict (allowlist at the container network layer).
- **Workspace filesystem layout is fixed** (spec section 15):
  ```text
  /workspace/repo        # repository code
  /workspace/context/    # context provider data
  /workspace/artifacts/  # build artifacts
  /workspace/logs/       # workspace logs
  /workspace/tmp/        # temporary files
  /workspace/.proagents/ # workspace metadata
  ```

## Isolation Honesty (non-negotiable)

| Runtime | Isolation | Report as |
|---------|-----------|-----------|
| Docker | container-level (shared kernel) | `Isolation: container` |
| Local | host-level | `Isolation: host-level` — **never** called a sandbox |
| E2B | cloud sandbox | `Isolation: sandbox` |
| Kubernetes (future) | pod-level (shared kernel) | `Isolation: pod` |

The security model must be visible: runtime, isolation level, and network policy are always reported together.

## Local Runtime Rules (spec section 13)

- Local runs on the host machine with no isolation boundary — its documentation and `paw doctor` output say so.
- Conservative defaults still apply: guarded Git operations, declared permissions, explicit network intent — even when the runtime itself cannot enforce container-level restrictions.

## Command Execution Rules

- `exec` flows through the permission framework; protection runs **before** execution (spec sections 101–102).
- Commands are classified (safe, potentially destructive, destructive, privileged, network-sensitive, credential-sensitive) when protection is enabled.
- Persistent terminals (`paw terminal attach`) are long-running processes managed through the same contract.

## Snapshots (spec section 45)

- Snapshot implementation is provider-specific; the exposure is common: `paw workspace snapshot create` / `snapshot restore <id>`.
- Snapshots capture runtime state, filesystem, environment configuration, installed dependencies, services, and context state where possible.

## Health

- Every runtime provider exposes health for `paw doctor`: connectivity, image availability, resource limits, disk space.
- A runtime that cannot honor its declared limits reports degraded health — never green.
