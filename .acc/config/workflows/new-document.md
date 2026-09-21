# Workflow: New Document

The workflow for adding a new document to `docs/`.

## When to use

- Adding a new concept, provider, or reference document to the documentation set

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md`
   - Local contract: `docs/AGENTS.md`
   - `.acc-memory.md` for prior lessons

2. **Confirm the document is needed.**
   - Check no existing document already covers the concept (see `docs/index.md`).
   - Confirm the content distills a real spec section — never invent.

3. **Create the document.**
   - kebab-case filename matching the existing convention (`runtime-providers.md`).
   - Open with `# <Title>` and a one-sentence summary.
   - Follow the documentation standard (`.acc/config/standards/documentation.md`).
   - CLI examples: binary `paw`, package `proagents-workspace`, SDK `@proagents/workspace`.

4. **Wire it into the index — required.**
   - Add the document to `docs/index.md` in the correct group (Getting Started / Concepts / Providers / Safety & Trust / Distribution) with a one-line description.
   - A document not reachable from the index violates the docs contract.

5. **Cross-link.**
   - Link the new document from related documents where it is referenced.
   - Use relative links only (`[text](file.md#anchor)`).

6. **Validate.**
   ```bash
   acc check        # 0 errors required
   # link check: every [text](target) in docs/*.md resolves
   # index check: the new document is reachable from docs/index.md
   ```

7. **Record durable knowledge.**
   ```bash
   acc memory add docs/ "<lesson learned>"
   ```

8. **Commit.**
   - Suggested message: `docs: add <document> — <what it covers>`

## Guardrails

- Never add a document that contradicts `README.md`.
- Never duplicate content that belongs in another document — cross-reference instead.
- Never bypass the index.
