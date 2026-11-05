# Code style

These rules concern code quality. They do not preserve the retired extraction architecture or approve a replacement.

## TypeScript and modules

- Keep strict TypeScript. Use unknown and narrow it rather than any, casts or non-null assertions.
- Prefer focused functions and explicit inputs/results. Exported functions declare return types. Use classes only where identity and mutable state are necessary.
- Use kebab-case filenames and descriptive role suffixes where useful. Use named exports and module entry points; organize by responsibility.
- This application uses ESM and NodeNext resolution. Internal runtime imports include .js extensions. Build settings come from the current repository configuration, not a copied Nisc package build recipe.
- Keep dependencies minimal and explicitly declare direct imports. Do not link sibling workspaces or patch installed packages.

## Boundaries and errors

- Validate untrusted input, stored documents, provider responses and effect outputs at their ownership boundaries. Use strict object schemas for external contracts.
- Own factory settings and mutable invocation input before asynchronous work. Propagate cancellation and deadlines through publication and cleanup.
- Expected unsupported or incomplete results need precise typed outcomes. Storage, telemetry and integrity failures cannot become successful output.
- Preserve source values and provenance. A failed expectation needs investigation before changing the expected result.

## Schemas and model instructions

- Schemas are the source of truth for offered shapes. Put meaningful descriptions on every model-facing decision and field; explain choices rather than making the model guess from names or IDs.
- Derive documentation and tool schemas from their owning contracts. Do not maintain a second prose grammar in prompts.
- Keep offered decision contracts small. Minify JSON in model context; pretty-print only for people.
- Package-level instructions must be generic. A correction that names a failed website or encodes its expected answer is not a general solution. Obtain independent review of model-facing contract changes.

## Comments and examples

Explain non-obvious reasons, not the next line of code. Prefer clearer names to explanatory comments. Do not keep commented-out code, obsolete APIs or file history in implementation comments.

Examples must be inspectable and match their declared behavior. Tests should exercise meaningful contracts and counterexamples, not repeat the implementation.

### Test standards

- A passing offline suite establishes mechanical contracts, not model accuracy. Scripted model replies test integration and failure handling; label them accordingly.
- Test request + URL → artifact → actual current data. Judge requested source-supported values and associations, changed/added/empty data, caller permissions, and execution without AI. An artifact existing or having status `ready` is not an accuracy result.
- Do not pin private helper names, JSON step layouts, exact internal phase sequences, repair partitions, prompt sentences, incidental serializer formatting, or key order. Exact counts belong only to explicit limits, duplicate-effect prevention, or measured performance requirements.
- An accuracy benchmark needs an independent expectation for final data or downloaded resources before effects. Identical DOM paths, a schema alone, a positive model review, or the discovered artifact's own selection cannot supply that expectation.
- Report useful partial results separately from complete answers and unusable output. Do not suppress partial results or weaken caller schemas to improve a score. Keep advisory review separate from mechanical availability and independent correctness checks.
- Context changes require inspection of exact model-bound messages from representative real captures. “Contains HTML” does not prove requested record containers are visible. Exercise head-heavy documents, omissions, continuation, and source ownership; do not inject the correct selectors and call it discovery accuracy.
- Preserve last useful artifacts and failed captures. Compare old and new artifacts on identical captures before blaming a changing website. A successful saved-artifact replay is still not evidence of successful fresh discovery.

## Release and data obligations

Eden is unreleased. An approved prototype replacement removes superseded contracts and updates its current consumers directly, without compatibility aliases or invented migration history.

Published dependencies retain their release guarantees. Applied catalogue SQL and its migration ledger are immutable; changes are appended under their existing owner. Neither rule requires preserving the rejected extraction design.
