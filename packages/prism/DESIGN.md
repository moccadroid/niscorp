# Prism — Design Document

Architecture, design decisions, and trade-offs behind `@niscorp/prism`. For usage documentation, see [DOCS.md](./DOCS.md).

---

## Architecture

```
Input Config (JSON)
       ↓
┌──────────────────┐
│  Schema Layer    │  Zod 4 validation of all node shapes
└───────┬──────────┘
        ↓
┌──────────────────┐
│  Sugar Layer     │  Desugar convenience ops → core ops (single pass)
└───────┬──────────┘
        ↓
┌──────────────────┐
│  Compile Layer   │  Walk tree, extract tables, fingerprint → IR artifact
└───────┬──────────┘
        ↓
┌──────────────────┐
│  Execute Layer   │  Evaluate nodes recursively against source data
└──────────────────┘
        ↓
    Output (JSON)
```

### Four Layers

**Schema** — Every op is a Zod schema with `.strict()` and `.describe()`. The top-level `NodeSchema` is a recursive union of ~70 op schemas plus primitives, arrays, and plain objects. Schemas are the source of truth for validation and JSON Schema generation (for LLM consumption).

**Sugar** — Convenience ops (`$sum`, `$avg`, `$pluck`, etc.) are rewritten to core ops in a single recursive pass before evaluation or compilation. This means the evaluator and compiler only need to handle core ops. Sugar rewriters receive a `recurse` function to transform their sub-expressions.

**Compile** — Walks the desugared tree, collecting stats (node count, op frequency, max depth), extracting tables (all JSONPaths, all string literals), and computing a SHA256 fingerprint. Produces a JSON-serializable IR artifact that can be stored and re-executed without re-validating or re-desugaring.

**Execute** — Recursive dispatcher using type guards. Each op is a pure function `(node, context, evaluate) => JsonValue`. The dispatcher walks the tree, matching op keys via type guards, and delegates to the appropriate handler. Plain objects without `$` keys are treated as output templates with recursive value evaluation.

---

## Evaluation Context

```typescript
type EvalContext = {
  source: JsonValue;                   // Root source data (immutable)
  vars: Record<string, JsonValue>;     // Scoped variables (immutable)
  budget?: Budget;                     // What this evaluation may still cost (engine/budget.ts)
};
```

Context is never mutated. Every scope change (loop variable, `$with` binding) creates a new context via spread. This means ops are pure — same input always produces same output.

---

## Op Handler Pattern

```typescript
type OpHandler<TNode> = (node: TNode, context: EvalContext, evaluate: EvaluateFn) => JsonValue;
```

Ops receive the `evaluate` function as a parameter rather than importing it. This avoids circular imports (ops need to evaluate sub-expressions, but the evaluator imports ops) and makes each op independently testable with a mock evaluator.

### Dispatcher (if-chain, not Map)

The evaluator uses a linear if-chain with type guards:

```typescript
if (isRefNode(obj)) return opRef(obj, context, evaluateNode);
if (isMapNode(obj)) return opMap(obj, context, evaluateNode);
// ... ~60 more
```

A Map-based dispatch would be shorter but loses type narrowing — each guard narrows the node to its specific type, so the handler receives a correctly typed argument without casts.

---

## Plain Objects and `__optional`

Objects without `$`-prefixed keys are output templates. Each value is recursively evaluated. The `__optional` metadata key lists fields that should be silently omitted when they evaluate to `null`/`undefined` or throw `E_MISSING_PATH`.

This enables partial results from incomplete source data without try/catch wrapping every field.

The schema and the evaluator hold one rule: a `$` name is an op's. The template branch's key pattern refuses every key that starts with `$`, which is exactly the evaluator's test for a plain object — so a `$` key that is not an op is `E_SCHEMA`, with the key's path, and not a config that validates, is stored, and fails each time it runs. Until `nisc.prism` 2 the pattern refused only the names of ops that existed, and each new op took a name away from templates; reserving the prefix means adding an op narrows nothing. Data that has `$` keys is a `$const` payload.

---

## JSONPath Subset

Prism supports `$.key.nested[0].deep` — dot notation for object keys, bracket notation for array indices. No filters, recursive descent, or unions. These omissions are intentional: `$filter`, `$map`, and `$merge` cover those use cases through the op system, which is composable and type-safe.

Parsed paths are cached in a `Map`. The compiled IR primes this cache.

---

## Compilation Model

`compile()` produces an IR that is JSON-serializable:

```typescript
type CompiledIr = {
  irVersion: 1;
  compiler: { name: string; version: string };
  meta: {
    name?: string;
    createdAt: string;
    fingerprint: string;                // SHA256 of the desugared, optimized core
    stats: { nodeCount, opCount, maxDepth, optimizations };
  };
  tables: {
    paths: string[];                    // JSONPaths for cache priming
    strings: string[];                  // String literals
  };
  core: unknown;                        // Desugared, optimized config
};
```

`execute()` skips validation and desugaring — it primes the JSONPath cache from `tables.paths` and evaluates `core` directly. How much that saves over `evaluate()` depends on the config: `pnpm bench` runs five against each other (`test/optimize.bench.ts`), from under 2x for a short map to over 50x where the constants fold.

The fingerprint enables cache invalidation: store IRs by name, check the fingerprint to know if the config changed.

---

## Error Model

All errors are `PrismError` instances with a `.code` string and optional `.context`:

| Code | When |
|------|------|
| `E_SCHEMA` | Config fails Zod validation |
| `E_MISSING_PATH` | `$ref` / `$get` path doesn't exist (no fallback) |
| `E_TYPE` | Wrong type for op (e.g. `$map.over` is not array) |
| `E_DIVISION_BY_ZERO` | `$div` with divisor 0 |
| `E_DATE_INVALID` | Unparseable date value |
| `E_VAR_NOT_FOUND` | `$var` references undefined variable |
| `E_NODE_SHAPE` | A node no op answers to, in a tree that skipped the schema (an IR given to `execute`) |
| `E_ASSERT` | A config's own `$assert` refused its input |
| `E_BUDGET` | An evaluation went past its budget (`engine/budget.ts`) |

---

## File Structure

```
src/
├── index.ts                       # Public API barrel
├── errors.ts                      # PrismError + error codes
├── types.ts                       # JsonValue, EvalContext, CompiledIr, etc.
├── schemas/
│   ├── index.ts                   # Schema barrel
│   ├── json.schema.ts             # JSON primitive/value/object schemas
│   ├── node.schema.ts             # NodeSchema (recursive union of all ops)
│   ├── config.schema.ts           # ConfigSchema
│   ├── guards.ts                  # Type guards (isRefNode, isMapNode, etc.)
│   ├── profiles.ts                # Named op subsets for documentation (MAPPING_OPS)
│   └── ops/                       # One schema file per category
│       ├── core.schema.ts
│       ├── array.schema.ts
│       ├── math.schema.ts
│       ├── string.schema.ts
│       ├── predicate.schema.ts
│       ├── logic.schema.ts
│       ├── structure.schema.ts
│       ├── object.schema.ts
│       ├── time.schema.ts
│       ├── intl.schema.ts
│       ├── transform.schema.ts
│       └── sugar.schema.ts
├── engine/
│   ├── evaluate.ts                # Dispatcher + evaluate / evaluateSafe
│   ├── transform.ts               # prismTransform — Prism in the shape a host's transform seam takes
│   ├── compile.ts                 # Config → CompiledIr
│   ├── optimize.ts                # Compile-time passes (ref segments, handlers, constant folding)
│   ├── budget.ts                  # Limits: steps, string length, result size
│   ├── execute.ts                 # CompiledIr + source → result
│   ├── validate.ts                # Config validation
│   └── documentation.ts           # JSON Schema generation
├── ops/                           # One implementation file per category
│   ├── core.ops.ts
│   ├── array.ops.ts
│   ├── math.ops.ts
│   ├── string.ops.ts
│   ├── predicate.ops.ts
│   ├── logic.ops.ts
│   ├── structure.ops.ts
│   ├── object.ops.ts
│   ├── time.ops.ts
│   ├── intl.ops.ts
│   └── transform.ops.ts
├── sugar/
│   ├── desugar.ts                 # Recursive desugaring pass
│   └── rewriters.ts               # Sugar → core rewrite functions
├── agent/                         # @niscorp/prism/agent
│   ├── index.ts
│   └── mapping-agent.ts           # mappingAgent (Cortex agent definition)
├── migrations/
│   └── index.ts                   # @niscorp/prism/migrations — PRISM_SEQUENCE, and prismTransform again
└── utils/
    ├── jsonpath.ts                # JSONPath parser + cache
    ├── compare.ts                 # Deep equality, ordered comparison
    └── issues.ts                  # Zod issues → the branch the config meant
```

---

## Dependencies

- `zod` (peer, ^4.2.0) — Schema validation, JSON Schema generation via `z.toJSONSchema()`
- `@niscorp/strata` (peer) — the depth guard on configs, and the sequence type behind `@niscorp/prism/migrations`
- `@niscorp/cortex`, `@niscorp/signal` (optional peers) — only for `@niscorp/prism/agent`
- `dayjs` (^1.11.20) — Date operations (`$date`, `$dateAdd`, `$dateDiff`)

The locale-aware family (`$localeDate`, `$localeMoney`, `$localeNumber`) adds
**no** dependency: it delegates to the platform's `Intl`. That is why dayjs
stays locale-blind here — localising it would mean shipping a locale pack per
language into a package that has no business knowing which languages exist.
Formatter construction is cached per resolved argument tuple, because building
an `Intl` formatter costs roughly two orders of magnitude more than using one
and a mapping over a thousand rows would otherwise build a thousand of them.

---

## Design Decisions

1. **Linear if-chain over Map dispatch.** Type narrowing. Each guard narrows the node type. A Map would need casts.

2. **Desugar before execution, not during.** One canonical representation. Compiler stores desugared form. Error messages reference core ops only.

3. **JSONPath subset, not full spec.** Filters, recursive descent, and unions overlap with `$filter`, `$map`, and `$merge`. The subset covers path access; ops cover everything else.

4. **SHA256 fingerprint on IR.** Cache invalidation without version numbers. Same config = same fingerprint.

5. **`evaluate` + `evaluateSafe`.** Throwing for trusted code, Result type for untrusted input. Different call sites have different needs.

6. **Ops receive `evaluate` as a parameter.** Breaks the circular import between ops and the dispatcher. Also enables mock-based unit testing of individual ops.

7. **`$with` uses `let`/`value`.** Reads like scoped bindings in most languages. `in` is a JS keyword.

8. **Math ops take `[node, node]` arrays.** Less verbose than `{ a, b }` objects. Consistent with predicates.

9. **`$case` uses `{ branches, else }`.** Clearer than a flat array mixing `{when,then}` and `{else}` objects. Simpler Zod schema.

10. **`compile()` is async.** Uses `crypto.subtle.digest` for SHA256, which is async in all runtimes. `evaluate()` stays sync because it doesn't need the fingerprint.

11. **The node union is tried by key before it is walked.** zod tries a union's 76 members in order, and a plain object is the last. One `$` key and nothing else can only be that op, and no `$` key can only be a template, so that member is tried first and a valid config never walks the union. An invalid one is walked as before, from the top, so a refusal is the union's own. The union stays a union: the JSON Schema, the profiles and loom read it as one.
