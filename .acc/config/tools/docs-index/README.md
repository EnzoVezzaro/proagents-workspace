# docs-index

Verifies that every document in `docs/` is reachable from `docs/index.md` — the single entry point of the documentation set.

## Purpose

The docs contract (`docs/AGENTS.md`) requires every document to be reachable from the index. An orphaned document is a contract violation even if its content is correct.

## What it checks

- Every `docs/*.md` file (except `docs/index.md` and `docs/AGENTS.md`) appears as a link in `docs/index.md`
- New documents added the index in the correct group (Getting Started / Concepts / Providers / Safety & Trust / Distribution) with a one-line description

## How to run

Manual equivalent (used until a script lands):

```bash
for f in docs/*.md; do
  name=$(basename "$f")
  [ "$name" = "index.md" ] && continue
  [ "$name" = "AGENTS.md" ] && continue
  grep -q "$name" docs/index.md || echo "NOT IN INDEX: $f"
done
```

Expected result: no `NOT IN INDEX` lines.

## Consumers

- `.acc/config/workflows/new-document.md` (step 6, index check)
- `.acc/config/workflows/release.md` (Links & index section)
