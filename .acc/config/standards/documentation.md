# Standard: Documentation

The rules every document in `docs/` must follow.

## Authority

- `README.md` is the canonical product specification. `docs/` distills it.
- `DISTRIBUTION.md` is the canonical supplement for protection & distribution.
- On any conflict, the spec wins; fix the doc.

## Naming & structure

- One document per concept or provider, kebab-case filenames (`runtime-providers.md`).
- `docs/index.md` is the single entry point; every document must be reachable from it.
- Each document opens with `# <Title>` followed by a one-sentence summary.

## Consistency rules

- CLI binary: `paw`. Package: `proagents-workspace`. SDK: `@proagents/workspace`.
- Runtime providers: E2B, Docker, local (future: Kubernetes, Firecracker, Daytona).
- Ecosystem roles: ProAgents = WHO, ACC = WHAT, Workspace = WHERE.
- CLI examples use `paw <command>`, never the package name.

## Honesty rules

- Never present local execution as equivalent to a sandbox.
- Never document provider-specific behavior as kernel behavior.
- Security models must be visible: state isolation level and network policy.

## Linking rules

- Relative links only within `docs/` (`[text](file.md#anchor)`).
- Every link must resolve — run the link check before committing.
- Cross-reference instead of duplicating: verification details live in `verification.md`, not repeated in `lifecycle.md`.

## Validation

```bash
acc check                        # 0 errors required
# link check: every [text](target) in docs/*.md resolves to an existing file/anchor
```
