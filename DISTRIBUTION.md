## Protection & Distribution Architecture

ProAgents Workspace should provide two additional capability layers around the development environment:

```text
Protection
Distribution
```

These layers extend the Workspace from a place where agents work into a complete lifecycle:

```text
ACCESS
  ↓
PROTECT
  ↓
WORK
  ↓
UNDERSTAND
  ↓
VERIFY
  ↓
PACKAGE
  ↓
DISTRIBUTE
  ↓
SELL / LICENSE
```

---

# 1. Complete Workspace Model

The Workspace architecture should now be understood as:

```text
                         PROAGENTS WORKSPACE

                              WORKSPACE
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
       ▼                          ▼                          ▼
  PROTECTION                   CONTEXT                  EXECUTION
       │                          │                          │
   Repo Shield                   ACC                    Runtime
       │                          │                          │
       │                          │                 ┌────────┼────────┐
       │                          │                 │        │        │
       │                          │                E2B    Docker    Local
       │                          │
       └──────────────────────────┼──────────────────────────┘
                                  │
                                  ▼
                             REPOSITORY
                                  │
                           Git / GitHub / ...
                                  │
                                  ▼
                               AGENT
                                  │
                     ┌────────────┼────────────┐
                     ▼            ▼            ▼
                   Tools      Services      Browser
                     │
                     ▼
                 VERIFICATION
                     │
                     ▼
                  ARTIFACT
                     │
                     ▼
                DISTRIBUTION
                     │
                  reposell
                     │
             ┌───────┼────────┐
             ▼       ▼        ▼
          License  Payment   Release
```

The important distinction is:

```text
Repo Shield = protect the software
ACC         = understand the software
Workspace   = work on the software
reposell    = distribute and commercialize the software
```

---

# 2. Protection Layer

Add a first-class:

```text
Protection Provider
```

contract.

The official implementation should be:

```text
Repo Shield
```

The Workspace should treat protection as a policy boundary around repository and agent operations.

---

# 3. Protection Provider Contract

Define:

```ts
interface ProtectionProvider {

  inspect(
    request: ProtectionInspection
  ): Promise<ProtectionResult>;

  authorize(
    request: ProtectionRequest
  ): Promise<ProtectionDecision>;

  beforeOperation?(
    operation: WorkspaceOperation
  ): Promise<ProtectionDecision>;

  afterOperation?(
    operation: WorkspaceOperation,
    result: OperationResult
  ): Promise<void>;

  scan?(
    target: ProtectionTarget
  ): Promise<SecurityReport>;

  status(): Promise<ProtectionStatus>;
}
```

A protection provider may inspect:

```text
repository
branch
file
commit
diff
agent action
shell command
tool invocation
MCP operation
network request
Git operation
release
distribution package
```

---

# 4. Repo Shield Integration

Provide:

```text
@proagents/plugin-repo-shield
```

The plugin connects Workspace security policy to Repo Shield.

The Workspace should not reimplement Repo Shield.

Instead:

```text
Agent
  ↓
Workspace operation
  ↓
Protection Provider
  ↓
Repo Shield
  ↓
ALLOW / WARN / BLOCK / APPROVE
  ↓
Operation
```

---

# 5. Protection Decisions

Protection providers should return structured decisions.

```ts
type ProtectionDecision =
  | {
      action: "allow";
    }
  | {
      action: "warn";
      reason: string;
    }
  | {
      action: "approve";
      reason: string;
      approval: ApprovalRequest;
    }
  | {
      action: "block";
      reason: string;
      rule?: string;
    };
```

This allows the Workspace to provide a consistent experience regardless of the protection implementation.

---

# 6. Protection Policy

A Workspace can define:

```yaml
protection:

  provider: repo-shield

  mode: guarded

  operations:

    filesystem:
      enabled: true

    shell:
      enabled: true

    git:
      enabled: true

    network:
      enabled: true

    mcp:
      enabled: true

    repository:
      enabled: true

    release:
      enabled: true
```

---

# 7. Protection Modes

Support:

```text
off
audit
warn
guarded
strict
```

### off

Protection provider is not enforced.

### audit

Operations are recorded but not blocked.

### warn

Potentially dangerous operations generate warnings.

### guarded

Sensitive operations require policy evaluation and potentially approval.

### strict

Operations violating policy are blocked.

---

# 8. Agent Action Protection

Protection must operate at the action boundary.

Example:

```text
Agent
  ↓
"git push --force origin main"
  ↓
Workspace
  ↓
Protection Provider
  ↓
BLOCK
```

The agent should receive:

```text
Operation blocked.

Rule:
protected-branch-force-push

Reason:
Force pushing to main is prohibited by Workspace policy.
```

Do not simply log the event after execution.

Protection must be able to intervene before execution.

---

# 9. Shell Protection

Shell commands should pass through the protection layer when protection is enabled.

Example:

```text
Agent:
rm -rf /workspace/repo
        ↓
Protection
        ↓
BLOCK
```

The Workspace should distinguish between:

```text
safe
potentially destructive
destructive
privileged
network-sensitive
credential-sensitive
```

---

# 10. Git Protection

Protect:

```text
force push
branch deletion
protected branches
history rewriting
destructive resets
remote changes
tag deletion
release operations
```

Example policy:

```yaml
protection:

  git:
    protected_branches:
      - main
      - master
      - production

    force_push: deny

    branch_delete:
      protected: deny
```

---

# 11. MCP Protection

MCP operations should also pass through protection policies where applicable.

Architecture:

```text
Agent
  ↓
MCP
  ↓
Workspace
  ↓
Protection
  ↓
MCP Provider
  ↓
External System
```

This provides a security boundary between an agent and external capabilities.

---

# 12. Network Protection

Protection can also evaluate network operations.

Example:

```text
Agent
  ↓
request api.example.com
  ↓
Network Provider
  ↓
Protection Provider
  ↓
ALLOW
```

Or:

```text
Agent
  ↓
request unknown-domain.example
  ↓
Protection Provider
  ↓
BLOCK
```

---

# 13. Protection Events

Emit events:

```text
protection/check
protection/warning
protection/approval-required
protection/allowed
protection/blocked
protection/error
```

Each event should include:

```text
workspace
session
agent
provider
operation
target
decision
rule
timestamp
```

---

# 14. Protection Audit

Expose:

```bash
paw protection status
paw protection audit
paw protection rules
paw protection inspect
```

Example:

```text
Protection

Provider:
  Repo Shield

Mode:
  Guarded

Rules:
  42 enabled

Today:
  182 operations checked
  176 allowed
  4 warnings
  2 blocked
```

---

# 15. Protection and ACC

ACC should be able to provide context to protection.

For example:

```text
Changed file:
src/auth/session.ts

ACC:
Critical authentication module

Protection:
Additional verification required
```

This allows protection to become context-aware without putting ACC inside Repo Shield.

The integration should remain:

```text
ACC
 ↓
Context Provider
 ↓
Workspace
 ↓
Protection Provider
```

---

# 16. Protection and ProAgents

A ProAgent profile can request a protection level.

Example:

```yaml
agent:
  profile: security-engineer

workspace:
  protection:
    mode: strict
```

A highly autonomous agent may require:

```text
strict protection
```

while a local experimentation agent may use:

```text
audit
```

---

# 17. Distribution Layer

Add a first-class:

```text
Distribution Provider
```

contract.

The official implementation should be:

```text
reposell
```

The distribution layer handles turning Workspace-compatible artifacts into distributable/licensable products.

---

# 18. Distribution Provider

Define:

```ts
interface DistributionProvider {

  inspect(
    artifact: DistributionArtifact
  ): Promise<DistributionStatus>;

  prepare(
    artifact: DistributionArtifact
  ): Promise<DistributionPackage>;

  publish(
    package: DistributionPackage
  ): Promise<Release>;

  verify(
    release: Release
  ): Promise<VerificationResult>;

  purchase?(
    request: PurchaseRequest
  ): Promise<Purchase>;

  grantAccess?(
    request: AccessGrantRequest
  ): Promise<AccessGrant>;
}
```

---

# 19. reposell Integration

Provide:

```text
@proagents/plugin-reposell
```

This integration should connect Workspace artifacts to reposell's existing repository-selling infrastructure.

reposell currently provides a CLI-based flow for turning Git repositories into purchasable products, including checkout, licensing, signed releases, Stripe payment links, and signed manifests. It also keeps signing keys local and supports CI-native releases.

Workspace should consume those capabilities rather than reproduce them.

---

# 20. What Can Be Sold

The distribution layer should not be limited to source-code repositories.

ProAgents Workspace should be able to package:

```text
Repository
Workspace Profile
ProAgent Profile
Agent Skill
Context Pack
ACC Configuration
MCP Integration
Verification Pack
Tool Provider
Runtime Configuration
Complete Agent Environment
```

This creates a larger ecosystem.

---

# 21. Complete Agent Environment

A commercial ProAgent could consist of:

```text
Professional Profile
+
Skills
+
Methods
+
Rules
+
ACC configuration
+
Workspace profile
+
Runtime requirements
+
Tools
+
MCP
+
Verification
+
Repository
```

This entire composition can become a distributable artifact.

---

# 22. Distribution Artifact

Define:

```ts
interface DistributionArtifact {
  id: string;

  type:
    | "repository"
    | "proagent"
    | "workspace"
    | "skill"
    | "context"
    | "tool"
    | "mcp"
    | "environment";

  version: string;

  source: ArtifactSource;

  manifest: ArtifactManifest;

  dependencies: ArtifactDependency[];

  compatibility: CompatibilitySpec;

  verification: VerificationMetadata;
}
```

---

# 23. Workspace Package

A Workspace itself should be exportable as a package.

Example:

```bash
paw workspace export
```

Output:

```text
workspace/
├── workspace.yaml
├── profile.yaml
├── verification/
├── policies/
├── providers/
└── README.md
```

The package can then be distributed.

---

# 24. Commercial Workspace

A company could sell:

```text
"Production TypeScript Agent Workspace"
```

containing:

```text
Node 22
pnpm
PostgreSQL
Redis
ACC
security policies
verification
browser
MCP
Codex configuration
```

The buyer purchases access through reposell.

The buyer receives the actual authorized repository/package according to the distribution provider's licensing model.

---

# 25. Distribution Lifecycle

The canonical lifecycle becomes:

```text
Build
 ↓
Validate
 ↓
Protect
 ↓
Verify
 ↓
Package
 ↓
Sign
 ↓
Publish
 ↓
Sell
 ↓
Grant access
 ↓
Install
 ↓
Run
```

---

# 26. Signed Artifacts

Distribution artifacts should support cryptographic integrity.

The Workspace should not implement its own signing protocol when reposell already provides the relevant mechanism.

Instead:

```text
Workspace
  ↓
Distribution Provider
  ↓
reposell
  ↓
Signed Manifest
  ↓
Release
```

The consumer can verify the resulting artifact.

reposell currently uses Ed25519 signatures for manifests and related trust material.

---

# 27. Licensing

Licensing should remain externalized through the distribution provider.

A Workspace package may declare:

```yaml
distribution:

  provider: reposell

  license:
    required: true

  access:
    mode: licensed
```

The Workspace does not become a payment processor.

It consumes the result:

```text
licensed
not licensed
license expired
access denied
```

---

# 28. Access Control

Before installing a protected commercial artifact:

```text
User
 ↓
Distribution Provider
 ↓
License/access verification
 ↓
Authorized
 ↓
Download / clone
 ↓
Workspace installation
```

If authorization fails:

```text
Installation blocked.

Artifact requires a valid license.
```

---

# 29. Protection + Distribution

These two layers should interact.

A seller may want to protect a repository before selling it.

Example:

```text
Repository
   ↓
Repo Shield
   ↓
Protect source
   ↓
reposell
   ↓
License / sell
```

And after purchase:

```text
Buyer
   ↓
reposell authorization
   ↓
Workspace
   ↓
Repo Shield policy
   ↓
Agent
```

This gives the product a complete trust boundary.

---

# 30. Commercial Agent Environment

The final experience could be:

```text
SELLER
  │
  ├── Professional Agent
  ├── Skills
  ├── ACC
  ├── Workspace
  ├── Runtime
  ├── Tools
  ├── Policies
  └── Verification
          │
          ▼
      Repo Shield
          │
          ▼
       reposell
          │
          ▼
       CUSTOMER
          │
          ▼
   ProAgents Workspace
          │
          ▼
        AGENT
```

---

# 31. Example Product

A seller could publish:

```text
Security Engineer Agent
```

Package:

```text
security-engineer/
├── agent/
│   └── profile.yaml
│
├── workspace/
│   └── workspace.yaml
│
├── context/
│   └── acc.yaml
│
├── skills/
│   ├── threat-modeling/
│   ├── secure-review/
│   └── dependency-analysis/
│
├── policies/
│   └── security.yaml
│
├── verification/
│   └── security.yaml
│
├── protection/
│   └── repo-shield.yaml
│
└── distribution/
    └── reposell.yaml
```

A customer purchases it.

The installation process resolves:

```text
license
 ↓
repository
 ↓
workspace
 ↓
runtime
 ↓
ACC
 ↓
skills
 ↓
agent
 ↓
protection
 ↓
verification
```

---

# 32. Workspace Marketplace Compatibility

Do not build a separate payment system into Workspace.

The Workspace should expose a generic distribution contract.

This allows:

```text
reposell
future marketplace
private registry
enterprise registry
internal artifact server
local distribution
```

to implement the same contract.

---

# 33. Distribution Commands

Add:

```bash
paw distribution inspect
paw distribution prepare
paw distribution publish
paw distribution verify
```

For reposell:

```bash
paw distribution provider reposell
```

The provider may expose additional commands:

```bash
paw reposell init
paw reposell doctor
paw reposell publish
paw reposell verify
```

Do not duplicate reposell's implementation.

---

# 34. Protection Commands

Add:

```bash
paw protection status
paw protection inspect
paw protection audit
paw protection check
```

The Repo Shield provider can expose additional commands when appropriate.

---

# 35. Workspace Lifecycle With Protection

The Workspace startup lifecycle becomes:

```text
Create Workspace
      ↓
Resolve runtime
      ↓
Resolve repository
      ↓
Resolve protection
      ↓
Initialize repository
      ↓
Initialize context
      ↓
Initialize agent
      ↓
Validate policy
      ↓
Workspace READY
```

---

# 36. Workspace Lifecycle With Distribution

For a commercial Workspace:

```text
Resolve artifact
      ↓
Verify distribution signature
      ↓
Verify license/access
      ↓
Resolve dependencies
      ↓
Create Workspace
      ↓
Resolve providers
      ↓
Initialize
      ↓
Verify environment
      ↓
Run
```

---

# 37. Full Architecture

The complete ProAgents Workspace architecture is:

```text
                              PROAGENTS WORKSPACE

                                      KERNEL
                                        │
       ┌────────────────────────────────┼────────────────────────────────┐
       │                                │                                │
       ▼                                ▼                                ▼
  PROTECTION                         CONTEXT                         EXECUTION
       │                                │                                │
   Repo Shield                         ACC                            Runtime
       │                                │                       ┌────────┼────────┐
       │                                │                       │        │        │
       │                                │                      E2B     Docker    Local
       │                                │
       └────────────────┬───────────────┴───────────────────────────────┘
                        │
                        ▼
                    REPOSITORY
                        │
                 GitHub / GitLab /
                 Gitea / Git / ...
                        │
                        ▼
                      AGENT
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
           Tools      Browser    Services
             │
             ▼
         VERIFICATION
             │
             ▼
          ARTIFACT
             │
             ▼
       DISTRIBUTION
             │
          reposell
             │
       ┌─────┼─────┐
       ▼     ▼     ▼
    License Payment Release
```

---

# 38. The Four-Layer Model

The product can now be described through four major layers:

```text
┌──────────────────────────────────────┐
│              AGENT                   │
│         intelligence / work          │
├──────────────────────────────────────┤
│             CONTEXT                  │
│       understanding / ACC            │
├──────────────────────────────────────┤
│             WORKSPACE                │
│       runtime / tools / repo         │
├──────────────────────────────────────┤
│       PROTECTION + DISTRIBUTION      │
│       trust / licensing / release    │
└──────────────────────────────────────┘
```

More precisely:

```text
ProAgent
   ↓
ACC
   ↓
Workspace
   ↓
Repo Shield
   ↓
Verification
   ↓
reposell
```

The actual runtime ordering may differ depending on the operation; these are conceptual layers rather than a mandatory linear pipeline.

---

# 39. Important Separation

Do not merge these products into Workspace.

Keep them as independently replaceable integrations:

```text
ProAgents
      = professional agents

ACC
      = agent context

ProAgents Workspace
      = execution environment

Repo Shield
      = protection

reposell
      = distribution / licensing / commerce
```

The Workspace becomes the composition point.

---

# 40. Long-Term Ecosystem

This architecture allows the ecosystem to grow into:

```text
                         PROAGENTS
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           Agents          ACC         Workspace
              │             │             │
              │             │       ┌─────┼─────┐
              │             │       │     │     │
              │             │     Runtime Repo  Tools
              │             │       │     │
              │             │       │     │
              └─────────────┼───────┘     │
                            │             │
                         Protection      │
                        Repo Shield      │
                            │             │
                            └──────┬──────┘
                                   │
                              Verification
                                   │
                                   ▼
                               reposell
                                   │
                                   ▼
                              Distribution
```

This turns ProAgents Workspace from merely a sandbox into the **execution, protection, verification, and distribution layer for professional AI software agents**.

The critical design constraint remains:

```text
Workspace should provide the contracts.

Providers should provide the implementations.

ProAgents should provide the professional agent.

ACC should provide the context.

Repo Shield should provide protection.

reposell should provide distribution and commerce.
```

That keeps every product independently useful while making them substantially more powerful when composed.
