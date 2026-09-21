# Distribution Layer

## Overview

Adds a first-class **Distribution Provider** contract. The official implementation is **reposell**.

The distribution layer handles turning Workspace-compatible artifacts into distributable/licensable products.

## Distribution Provider Contract

```typescript
interface DistributionProvider {
  inspect(artifact: DistributionArtifact): Promise<DistributionStatus>;
  prepare(artifact: DistributionArtifact): Promise<DistributionPackage>;
  publish(package: DistributionPackage): Promise<Release>;
  verify(release: Release): Promise<VerificationResult>;
  purchase?(request: PurchaseRequest): Promise<Purchase>;
  grantAccess?(request: AccessGrantRequest): Promise<AccessGrant>;
}
```

## reposell Integration

Provides `@proagents/plugin-reposell` connecting Workspace artifacts to reposell's existing repository-selling infrastructure.

reposell currently provides:
- CLI-based flow for turning Git repositories into purchasable products
- Checkout, licensing, signed releases
- Stripe payment links
- Signed manifests
- Local signing keys
- CI-native releases

Workspace consumes those capabilities rather than reproducing them.

## What Can Be Sold

Not limited to source-code repositories:

```
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

## Complete Agent Environment

A commercial ProAgent could consist of:

```
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

This entire composition becomes a distributable artifact.

## Distribution Artifact

```typescript
interface DistributionArtifact {
  id: string;
  type: "repository" | "proagent" | "workspace" | "skill" | "context" | "tool" | "mcp" | "environment";
  version: string;
  source: ArtifactSource;
  manifest: ArtifactManifest;
  dependencies: ArtifactDependency[];
  compatibility: CompatibilitySpec;
  verification: VerificationMetadata;
}
```

## Workspace Package

A Workspace itself is exportable as a package:

```bash
paw workspace export
```

Output:
```
workspace/
├── workspace.yaml
├── profile.yaml
├── verification/
├── policies/
├── providers/
└── README.md
```

## Commercial Workspace Example

A company could sell:
```
"Production TypeScript Agent Workspace"
```

Containing:
```
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

The buyer purchases access through reposell and receives the authorized repository/package according to the distribution provider's licensing model.

## Distribution Lifecycle

```
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

## Signed Artifacts

Distribution artifacts support cryptographic integrity:

```
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

reposell uses Ed25519 signatures for manifests and trust material.

## Licensing

Licensing remains externalized through the distribution provider.

```yaml
distribution:
  provider: reposell
  license:
    required: true
  access:
    mode: licensed
```

Workspace does not become a payment processor. It consumes the result:
```
licensed
not licensed
license expired
access denied
```

## Access Control

Before installing a protected commercial artifact:

```
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
```
Installation blocked.
Artifact requires a valid license.
```

## Protection + Distribution

These layers interact:

```
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

After purchase:
```
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

## Commercial Agent Environment

```
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

## Example Product Package

```
security-engineer/
├── agent/
│   └── profile.yaml
├── workspace/
│   └── workspace.yaml
├── context/
│   └── acc.yaml
├── skills/
│   ├── threat-modeling/
│   ├── secure-review/
│   └── dependency-analysis/
├── policies/
│   └── security.yaml
├── verification/
│   └── security.yaml
├── protection/
│   └── repo-shield.yaml
└── distribution/
    └── reposell.yaml
```

Installation resolves:
```
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

## Workspace Marketplace Compatibility

Do not build a separate payment system into Workspace. Expose a generic distribution contract allowing:
- reposell
- future marketplace
- private registry
- enterprise registry
- internal artifact server
- local distribution

## CLI Commands

```bash
paw distribution inspect
paw distribution prepare
paw distribution publish
paw distribution verify
paw distribution provider reposell
```

reposell may expose additional commands:
```bash
paw reposell init
paw reposell doctor
paw reposell publish
paw reposell verify
```

**Do not duplicate reposell's implementation.**