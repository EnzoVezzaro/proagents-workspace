# Verification

Verification is a first-class Workspace capability. It is not a single final step — it is a programmable loop integrated into the [Development Lifecycle](lifecycle.md).

## Verification Provider Contract

```typescript
interface VerificationProvider {
  run(request: VerificationRequest): Promise<VerificationResult>;
}
```

```typescript
interface VerificationRequest {
  workspaceId: string;
  commands: string[];
  scope?: "full" | "changed" | "impact";
}

interface VerificationResult {
  status: "pass" | "fail";
  steps: VerificationStepResult[];
  duration: number;
  artifacts?: ArtifactReference[];
}
```

## What Verification Executes

- Lint
- Typecheck
- Unit tests
- Integration tests
- Build
- Security scans
- Custom commands

## Configuration

```yaml
verification:
  commands:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build
```

Verification commands are executed inside the Workspace runtime, subject to the Workspace [permissions](security.md) and [network policy](security.md#network-security).

## Change Verification

After an agent modifies code, verification runs against the change:

```
Agent changes
      ↓
Git diff
      ↓
Affected files
      ↓
Context impact analysis
      ↓
Tests
      ↓
Build
      ↓
Verification
      ↓
Result
```

## Impact-Aware Verification

If a context provider (such as ACC) is available, Workspace uses it to select the most relevant checks:

```
Changed:
src/auth/session.ts

ACC:
12 dependent modules

Verification:
auth tests
session tests
API tests
```

Impact analysis narrows the verification scope while keeping the option to run the full suite.

## Verification + Lifecycle

Verification steps compose into the [programmable lifecycle](lifecycle.md):

```yaml
lifecycle:
  steps:
    - id: lint
      type: lint

    - id: typecheck
      type: typecheck

    - id: unit-tests
      type: test

    - id: browser-chromium
      type: browser-test
      engine: chromium

    - id: security
      type: security-test

    - id: final-verification
      type: verification
      commands:
        - pnpm build
```

Each step produces a result, results are evaluated, and failures loop back into a fix cycle.

## Pull Request Verification

When creating a pull request, Workspace collects verification results automatically:

```
branch
commits
diff
verification results
test results
context impact
agent summary
```

The PR description embeds the verification report so reviewers see exactly what passed:

```
Summary
-------

Implemented session expiration handling.

Changes
-------

- Added session expiration validation
- Added refresh token handling
- Added tests

Verification
------------

✓ Unit tests
✓ Typecheck
✓ Build
```

## CLI Commands

```bash
paw verify
paw verify test
paw verify build
paw verify lint
paw verify typecheck
```

## Events

```
verification/started
verification/completed
verification/failed
verification/step/started
verification/step/completed
```

## Reports

Verification runs produce first-class [artifacts](cli-reference.md):

- Test reports
- Coverage
- Build output
- Analysis reports

Artifacts are stored per workspace and referenced from the verification history in Workspace state.
