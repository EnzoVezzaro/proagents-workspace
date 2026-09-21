# kubernetes

Kubernetes tooling for the future Kubernetes runtime provider (spec section 15 future providers, `.acc/config/standards/container.md`, `.acc/config/agents/kubernetes-engineer.md`).

## Purpose

Design, test, and verify the Kubernetes runtime provider mapping — workspace → namespace-scoped workload — before any of it is product code.

## Prerequisites

- `kubectl` CLI on PATH
- A disposable cluster (kind, k3d, minikube) — never a production cluster

## Commands

```bash
kubectl version --client         # CLI present
kubectl get ns                   # workspace namespaces (one workspace = one ns)
kubectl get pods -l workspace=   # workspace workloads by workspace ID label
kubectl describe pod <pod>       # security context: non-root, dropped caps
kubectl get networkpolicy -A     # declared restrictions actually enforced
kubectl get quota -A            # CPU/memory limits honored
kubectl delete ns <workspace>    # full workspace cleanup
```

## Provider mapping (the design the provider implements)

| Workspace concept | Kubernetes primitive |
|-------------------|----------------------|
| workspace | namespace-scoped workload |
| permissions | pod security context + RBAC |
| network policy | NetworkPolicy objects |
| services | in-cluster services |
| snapshots | volume snapshots (where supported) |

## Safety rules

- Sandbox workloads schedule on tainted/labeled nodes; never share pools with services
- Pod security context: run-as-non-root, read-only root FS, all capabilities dropped, no host mounts
- Every resource labeled with the workspace ID — multi-tenancy must not be prevented (spec section 116)
- Never map a declared restriction to a weaker Kubernetes equivalent silently — if the runtime cannot enforce it, report it

## Status

The Kubernetes provider is post-V1 (spec section 134). V1 scope is local + Docker. This tool exists so the design, manifests, and mapping are ready when the provider is scheduled.

## Consumers

- `.acc/config/agents/kubernetes-engineer.md`
- `.acc/config/agents/runtime-engineer.md`
- `.acc/config/workflows/new-provider.md` (when the provider is scheduled)
