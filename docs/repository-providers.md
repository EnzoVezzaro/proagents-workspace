# Repository Providers

## Repository Provider Contract

```typescript
interface RepositoryProvider {
  listRepositories(options?: RepositoryListOptions): Promise<Repository[]>;
  getRepository(reference: RepositoryReference): Promise<Repository>;
  clone(reference: RepositoryReference, destination: string, options?: CloneOptions): Promise<CloneResult>;
  fetch(repository: LocalRepository): Promise<void>;
  checkout(repository: LocalRepository, reference: GitReference): Promise<void>;
  createBranch(repository: LocalRepository, branch: string): Promise<void>;
  push(repository: LocalRepository, options: PushOptions): Promise<void>;
}
```

## Pull Request Provider (Separate Capability)

```typescript
interface PullRequestProvider {
  create(request: PullRequestRequest): Promise<PullRequest>;
  update(id: string, request: PullRequestUpdate): Promise<PullRequest>;
  list(repository: RepositoryReference): Promise<PullRequest[]>;
}
```

## Supported Providers

- GitHub (official)
- GitLab
- Bitbucket
- Gitea
- Forgejo
- Azure DevOps
- Generic Git
- Local repositories

## GitHub Integration (Official)

### User Flow

```bash
paw github connect
```

Then the provider handles authentication and repository selection.

### Workspace Configuration

```yaml
repository:
  provider: github
  repository: acme/project
  branch: feature/auth
```

### Architecture

The kernel does not know what GitHub is. The GitHub provider translates the generic repository contract into GitHub operations.

### Authentication

- Uses secure mechanisms (GitHub App where appropriate)
- Never stores long-lived credentials inside a Workspace image
- Credentials injected dynamically

## Repository Initialization

```
Create runtime
       ↓
Prepare filesystem
       ↓
Authenticate repository provider
       ↓
Clone repository
       ↓
Checkout requested branch/commit
       ↓
Detect project
       ↓
Prepare dependencies
       ↓
Initialize context providers
       ↓
Workspace READY
```

### Observable Process

```
✓ Runtime
✓ Repository authentication
✓ Clone
✓ Branch checkout
✓ Project detection
✓ Dependency detection
✓ Context initialization
✓ Workspace ready
```

## Project Detection

The Workspace inspects the repository and determines the development environment:

| File | Detected |
|------|----------|
| package.json | Node.js |
| pnpm-lock.yaml | pnpm |
| yarn.lock | Yarn |
| bun.lock | Bun |
| Cargo.toml | Rust |
| go.mod | Go |
| pyproject.toml | Python |
| requirements.txt | Python |
| pom.xml | Java |
| build.gradle | Java/Kotlin |
| Gemfile | Ruby |
| composer.json | PHP |
| Makefile | Generic build |
| Dockerfile | Containerized project |

Detection produces a project profile:

```json
{
  "language": ["typescript"],
  "runtime": "node",
  "packageManager": "pnpm",
  "framework": ["nextjs"],
  "test": "vitest",
  "build": "next build"
}
```

**Security**: Do not blindly execute arbitrary install scripts without applying Workspace security policy.