# docker

Docker tooling for the ProAgents Workspace Docker runtime provider (spec section 14, `.acc/config/standards/container.md`).

## Purpose

The V1 runtime story is local + Docker (spec section 134). This tool covers everything the runtime engineer needs to develop, test, and debug the Docker runtime provider.

## Prerequisites

- Docker Desktop, colima, or a Docker-compatible engine
- `docker` CLI on PATH

## Commands

```bash
docker version                    # engine reachable — first doctor check
docker images                      # available images for runtime.provider: docker
docker pull node:22                # pull a declared runtime image
docker run --rm -it node:22 sh     # reproduce a workspace shell manually
docker ps --filter label=workspace # workspace workloads (provider labels workspaces)
docker stats                       # CPU/memory — validate declared limits
docker network create ...          # restricted-mode allowlist networking
docker system prune                # cleanup (spec section 113)
```

## How the provider uses Docker

- Workspace = container with declared image, CPU/memory/disk limits, volumes, ports
- `/workspace/repo` and sibling directories map from the fixed layout (spec section 15)
- Network policy enforced at the container network layer — restricted mode restricts for real
- Snapshots via committed images/volumes where the abstraction allows

## Safety rules

- Never bypass the permission framework by shelling to `docker` directly from kernel code — the provider implements `RuntimeProvider` and flows through protection (spec sections 101–102)
- Never mount host paths outside declared permissions
- Resource limits declared in the workspace config are honored exactly or reported

## Consumers

- `.acc/config/agents/runtime-engineer.md`
- `.acc/config/agents/kubernetes-engineer.md` (isolation comparison)
- `.acc/config/workflows/new-provider.md` (Docker provider contract tests)
- `paw doctor` (runtime connectivity checks, spec sections 62–63)
