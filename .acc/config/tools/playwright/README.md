# playwright

Browser automation tooling for ProAgents Workspace — the browser-test lifecycle steps and the BrowserProvider implementations (spec sections 31–32, `docs/lifecycle.md`, `docs/security.md#browser-security`).

## Purpose

Two distinct uses:
1. **Product runtime**: the BrowserProvider capability (`paw` lifecycle browser-test steps) — implementations: Playwright, Chromium, Browserbase, E2B browser, custom.
2. **Project tests**: browser-test steps in the verification lifecycle for workspace workspaces that include a UI.

## Prerequisites

- Node.js 18+, pnpm
- Playwright browsers installed (`pnpm exec playwright install`)

## Commands

```bash
pnpm exec playwright install             # browser binaries
pnpm exec playwright test                  # browser-test lifecycle steps
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=firefox
pnpm exec playwright test --project=webkit
```

## Lifecycle step types (`docs/lifecycle.md`)

```yaml
lifecycle:
  steps:
    - id: browser-chromium
      type: browser-test
      engine: chromium
    - id: browser-firefox
      type: browser-test
      engine: firefox
    - id: browser-webkit
      type: browser-test
      engine: webkit
```

Each step produces a result; results are evaluated; failures loop back into the fix cycle.

## Safety rules

- Browser access inside a workspace is **optional** and permission-governed (spec sections 31–32)
- Browser sessions pass through the protection boundary like every other capability
- Browser-test steps run inside the workspace runtime, subject to its network policy — restricted mode restricts browser egress too
- Screenshots and traces are workspace artifacts (spec section 44) — they never contain secrets (no credential screenshots in committed reports)

## Consumers

- `.acc/config/agents/verification-engineer.md` (lifecycle steps)
- `.acc/config/workflows/testing.md` (browser-test coverage)
- `docs/lifecycle.md` (step registry), `docs/verification.md` (lifecycle composition)
