# @niscorp/prism

Pure JSON data transformation DSL with compilation, caching, and zero code execution risk.

Transformations are JSON objects — no code strings, no `eval`, no security risks. Designed so LLMs can generate transformation configs that are safe to execute.

## Install

```bash
pnpm add @niscorp/prism @niscorp/strata zod
```

`@niscorp/strata` and `zod` are required peers. `@niscorp/cortex` and
`@niscorp/signal` are optional — only the mapping agent at
`@niscorp/prism/agent` (`mappingAgent`) needs them.

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
evaluate(config, source, limits?) → JsonValue
evaluateSafe(config, source, limits?) → { ok: true, data } | { ok: false, error }

// The same, in the shape a host's transform seam takes
prismTransform(config: unknown, source: unknown) → unknown

// Compile once, execute many (2-5x faster for repeated configs)
compile(config, options?) → Promise<CompiledIr>
execute(ir, source, limits?) → JsonValue

// Validation
validate(config) → { ok: true, data } | { ok: false, issues }

// JSON Schema for LLM consumption
getNodeJsonSchema(target?) → object
getConfigJsonSchema(target?) → object
```

## As a host's transform

nova's shell, tide's engine and strata's upgrader each run a config through a
transform they are handed, `(config, source) => unknown`, and know nothing of
Prism. `prismTransform` is Prism in that shape:

```typescript
import { prismTransform } from '@niscorp/prism';

createTide({ store, transform: prismTransform, effects });   // @niscorp/tide
createUpgrader(grammars, { transform: prismTransform });     // @niscorp/strata
```

Both sides arrive untyped, so both are checked: the config is parsed against
`ConfigSchema` (once for each config object), and the source must be plain JSON
— a source holding `undefined`, a function or a non-finite number is refused.
`evaluate` is typed for a `JsonValue` and checks no source, which is why it
cannot be handed to a seam as it is. A host that adds values of its own to the
source first (the app's "today", the session's principal) wraps it.

## Examples

`@niscorp/prism/examples` is the reference as data: one example for each
operator, named by the operator — a config, the source it is given, and what
comes out — then a few configs of several operators working together.

```typescript
import { evaluate } from '@niscorp/prism';
import { PRISM_EXAMPLES, PRISM_EXAMPLE_GROUPS } from '@niscorp/prism/examples';

const map = PRISM_EXAMPLES.find((example) => example.op === '$map');
// → { id: 'map', group: 'arrays', title: '$map', description, op: '$map', source, config, expected }
evaluate(map.config, map.source); // → map.expected

// PRISM_EXAMPLE_GROUPS → [{ id: 'arrays', title: 'Arrays', description }, …]
// the groups the reference puts the operators in, in the same order
```

They are tested with the package (`test/examples.test.ts`): each one evaluates to
its `expected`, and every operator in `OP_KEYS` has exactly one example of its
own. So whatever shows them — a documentation page, an agent reading
`node_modules` — is showing what the installed version does.

## Profiles

`getProfileJsonSchema(ops, target?)` is the config JSON Schema documenting only
the ops you name — derived from the full schema, never restated. `MAPPING_OPS`
is the set a mapping uses (rows into a shape), about 28% less prompt than the
whole grammar; the mapping agent is documented with it. A profile narrows what
a prompt teaches, never what Prism accepts: validation is always the full
`ConfigSchema`, and a config using an op outside the profile is still valid.

## Transform ops and the grammar

Besides deriving values, a config can rewrite a document: `$has`,
`$renameKeys`, `$update`, `$assert` and `$walk` (every node of a tree, by
rules) — see [DOCS.md § Transform Operations](./DOCS.md#transform-operations).
They are what strata's document migrations are written in.

**`@niscorp/prism/migrations`** publishes Prism's own grammar — `PRISM_SEQUENCE`
(`nisc.prism`, kind `nisc.prism/config`), `PRISM_SCHEMAS` — and exports
`prismTransform` as well, the evaluator a migration runs through (strata injects
it): the same function as the main entry's.

**The op set only ever grows.** Configs are stored — endpoint requests, vex
mappings, migrations — and a migration cannot be migrated by the language it is
written in: an op is never removed or reshaped; an old form stays as sugar.
`test/transform.test.ts` keeps the record; a grammar change is a migration on
`nisc.prism`, gated by `pnpm check:grammars`.

## License

Apache-2.0
