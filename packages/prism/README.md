# @niscorp/prism

Pure JSON data transformation DSL with compilation, caching, and zero code execution risk.

Transformations are JSON objects — no code strings, no `eval`, no security risks. Designed so LLMs can generate transformation configs that are safe to execute.

## Install

```bash
pnpm add @niscorp/prism zod
```

## Quick Example

```typescript
import { evaluate } from '@niscorp/prism';

const result = evaluate(
  {
    fullName: {
      $join: {
        parts: [{ $ref: '$.user.firstName' }, { $ref: '$.user.lastName' }],
        sep: ' ',
      },
    },
    itemCount: { $length: { $ref: '$.items' } },
    total: { $sum: { over: { $pluck: { over: { $ref: '$.items' }, key: 'price' } } } },
  },
  {
    user: { firstName: 'Alice', lastName: 'Smith' },
    items: [
      { name: 'Widget', price: 9.99 },
      { name: 'Gadget', price: 24.99 },
    ],
  },
);
// → { fullName: 'Alice Smith', itemCount: 2, total: 34.98 }
```

## Documentation

- **[DOCS.md](./DOCS.md)** — Full reference for every operation, with examples
- **[DESIGN.md](./DESIGN.md)** — Architecture, design decisions, and trade-offs

## API

```typescript
// One-shot evaluation
evaluate(config, source) → JsonValue
evaluateSafe(config, source) → { ok: true, data } | { ok: false, error }

// Compile once, execute many (2-5x faster for repeated configs)
compile(config, options?) → Promise<CompiledIr>
execute(ir, source) → JsonValue

// Validation
validate(config) → { ok: true, data } | { ok: false, issues }

// JSON Schema for LLM consumption
getNodeJsonSchema(target?) → object
getConfigJsonSchema(target?) → object
```

## Transform ops and the grammar

Besides deriving values, a config can rewrite a document: `$has`,
`$renameKeys`, `$update`, `$assert` and `$walk` (every node of a tree, by
rules) — see [DOCS.md § Transform Operations](./DOCS.md#transform-operations).
They are what strata's document migrations are written in.

**`@niscorp/prism/migrations`** publishes Prism's own grammar — `PRISM_SEQUENCE`
(`nisc.prism`, kind `nisc.prism/config`), `PRISM_SCHEMAS` — and
`prismTransform`, the evaluator a migration runs through (strata injects it;
the config is parsed once, the source must be plain JSON).

**The op set only ever grows.** Configs are stored — endpoint requests, vex
mappings, migrations — and a migration cannot be migrated by the language it is
written in: an op is never removed or reshaped; an old form stays as sugar.
`test/transform.test.ts` keeps the record; a grammar change is a migration on
`nisc.prism`, gated by `pnpm check:grammars`.

## License

Apache-2.0
