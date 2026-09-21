# link-check

Verifies that every Markdown link in `docs/` resolves to an existing document or anchor.

## Purpose

The documentation contract requires every cross-link to be valid (see `docs/AGENTS.md` and `.acc/config/standards/documentation.md`). This tool performs the check referenced by the validation step of the documentation workflows.

## What it checks

- Relative links only within `docs/` (`[text](file.md#anchor)`)
- Every `[text](target)` target resolves to an existing file
- Anchor targets resolve to an existing heading

## How to run

Manual equivalent (used until a script lands):

```bash
for f in docs/*.md; do
  grep -oE '\]\(([a-z-]+\.md)(#[^)]*)?\)' "$f" \
    | sed -E 's/\]\(([^)#]+).*/\1/' \
    | while read link; do [ -f "docs/$link" ] || echo "BROKEN in $f -> $link"; done
done
```

Expected result: no `BROKEN` lines.

## Consumers

- `.acc/config/workflows/feature.md` (documentation change workflow, step 4)
- `.acc/config/workflows/spec-change.md` (step 5)
- `.acc/config/workflows/new-document.md` (step 6)
- `.acc/config/workflows/release.md` (Links & index section)
