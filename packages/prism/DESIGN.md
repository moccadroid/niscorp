# Design Document: `@niscorp/prism` — JSON Transformation Engine

## Purpose

A pure JSON data transformation library. Transformations are JSON objects evaluated by a lightweight engine. No code strings, no eval, no security risks. Compiles to an intermediate representation for production performance.

**One sentence:** jq for JavaScript — a JSON DSL that transforms JSON, with compilation and zero code execution.

---

## What Stays From The Original

The original transformation engine (*project-iris*) is the most mature project in the archive. The architecture, the operation set, the compilation model, and the two-layer (sugar/core) operation system are all sound. This is a rewrite for legal/copyright reasons and to take the opportunity to address a few rough edges - not a redesign.

### Kept as-is (conceptually)
- Pure JSON DSL - transformations are JSON objects
- Four-layer architecture: Schema → Sugar → Compilation → Execution
- Two-layer operations: sugar ops desugar to core ops in a single pass
- Compiled IR with SHA256 fingerprint for cache invalidation
- JSONPath subset (`$.a.b[0].c`) for data access
- `evaluate()` for one-shot, `compile()` + `execute()` for production
- Result type pattern (`evaluateSafe` returning `{ ok, data } | { ok, error }`)
- Strict Zod schemas with `.describe()` on everything

### Changed
- Drop Zod v3 compatibility (Zod 4+ only)
- New package name and namespace
- Fresh codebase (no copy-paste from original)
- Improvements listed below

---

## Architecture

```
Input Config (JSON)
       ↓
┌──────────────────┐
│  Schema Layer    │  Zod validation of all node shapes
└───────┬──────────┘
        ↓
┌──────────────────┐
│  Sugar Layer     │  Desugar convenience ops → core ops (single pass)
└───────┬──────────┘
        ↓
┌──────────────────┐
│  Compile Layer   │  Optimize, extract tables, fingerprint → IR artifact
└───────┬──────────┘
        ↓
┌──────────────────┐
│  Execute Layer   │  Evaluate nodes recursively against source data
└──────────────────┘
        ↓
    Output (JSON)
```

---

## Public API

```typescript
// ═══════════════════════════════════════════════════════════
// Evaluation (one-shot)
// ═══════════════════════════════════════════════════════════

export const evaluate: (config: Config, source: JsonObject) => JsonValue;
export const evaluateSafe: (config: Config, source: JsonObject) => Result<JsonValue>;

// ═══════════════════════════════════════════════════════════
// Compilation (production)
// ═══════════════════════════════════════════════════════════

export const compile: (config: Config, options?: CompileOptions) => CompiledIr;
export const execute: (ir: CompiledIr, source: JsonObject) => JsonValue;

// ═══════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════

export const validate: (config: unknown) => ValidationResult;

// ═══════════════════════════════════════════════════════════
// Documentation
// ═══════════════════════════════════════════════════════════

export const getConfigJsonSchema: (target?: JsonSchemaTarget) => JsonSchema;
export const getNodeJsonSchema: (target?: JsonSchemaTarget) => JsonSchema;

// ═══════════════════════════════════════════════════════════
// Schemas & Types
// ═══════════════════════════════════════════════════════════

export { ConfigSchema, NodeSchema };
export type { Config, Node, JsonValue, JsonObject, CompiledIr, CompileOptions, ValidationResult };
```

That's it. Seven functions, two schemas, a handful of types. Small, focused API.

---

## Operations

### Core Operations (always available, minimal, composable)

| Op | Shape | Purpose |
|----|-------|---------|
| `$ref` | `{ $ref: "$.path" }` | Resolve JSONPath against source |
| `$const` | `{ $const: <any json> }` | Literal value |
| `$var` | `{ $var: "name" }` | Read variable from `$with` scope |
| `$get` | `{ $get: { from: node, path: [...], fallback?: node } }` | Dynamic path access |
| `$with` | `{ $with: { vars: { ... }, in: node } }` | Variable scoping |
| `$map` | `{ $map: { over: node, as: "item", body: node } }` | Transform each element |
| `$filter` | `{ $filter: { over: node, as: "item", when: node } }` | Keep matching elements |
| `$reduce` | `{ $reduce: { over: node, as: "item", acc: "acc", init: node, body: node } }` | Fold/accumulate |
| `$slice` | `{ $slice: { from: node, start?: num, end?: num } }` | Array/string slice |
| `$flatten` | `{ $flatten: node }` | Flatten one level |
| `$unique` | `{ $unique: node }` | Deduplicate |
| `$sortBy` | `{ $sortBy: { over: node, as: "item", by: node, dir?: "asc"/"desc" } }` | Sort by computed key |
| `$merge` | `{ $merge: [node, node, ...] }` | Shallow merge objects |
| `$coalesce` | `{ $coalesce: [node, node, ...] }` | First non-null |
| `$case` | `{ $case: [{ when: node, then: node }, ...], else?: node }` | Conditional branching |
| `$entriesOf` | `{ $entriesOf: node }` | Object → [key, value][] |
| `$keyBy` | `{ $keyBy: { over: node, as: "item", key: node } }` | Array → object by key |
| `$groupBy` | `{ $groupBy: { over: node, as: "item", key: node } }` | Array → grouped object |
| `$add` | `{ $add: [node, node] }` | Addition |
| `$sub` | `{ $sub: [node, node] }` | Subtraction |
| `$mul` | `{ $mul: [node, node] }` | Multiplication |
| `$div` | `{ $div: [node, node] }` | Division |
| `$round` | `{ $round: { value: node, digits?: number } }` | Round to digits |
| `$join` | `{ $join: { parts: [node, ...], sep?: string } }` | Concatenate to string |
| `$toString` | `{ $toString: node }` | Stringify |
| `$eq` | `{ $eq: [node, node] }` | Equality |
| `$neq` | `{ $neq: [node, node] }` | Inequality |
| `$gt` | `{ $gt: [node, node] }` | Greater than |
| `$gte` | `{ $gte: [node, node] }` | Greater than or equal |
| `$lt` | `{ $lt: [node, node] }` | Less than |
| `$lte` | `{ $lte: [node, node] }` | Less than or equal |
| `$empty` | `{ $empty: node }` | Is empty (null, "", [], {}) |
| `$startsWith` | `{ $startsWith: { value: node, prefix: node } }` | String starts with |
| `$endsWith` | `{ $endsWith: { value: node, suffix: node } }` | String ends with |
| `$contains` | `{ $contains: { value: node, search: node } }` | String contains |
| `$date` | `{ $date: { value: node, format?: string, utc?: boolean } }` | Date formatting |

### Sugar Operations (convenience, desugar to core)

| Sugar | Desugars To | Purpose |
|-------|-------------|---------|
| `$sum` | `$reduce` with `$add` | Sum array of numbers |
| `$avg` | `$div($sum, $count)` | Average |
| `$count` | `$reduce` with increment | Count elements |
| `$min` | `$reduce` with `$lt` | Minimum value |
| `$max` | `$reduce` with `$gt` | Maximum value |
| `$pluck` | `$map` with `$get` | Extract field from each |
| `$take` | `$slice` with end | First N elements |
| `$drop` | `$slice` with start | Skip first N |
| `$match` | `$filter` with string match | Filter by string content |
| `$flatMap` | `$map` then `$flatten` | Map and flatten |

### New Operations (not in original)

| Op | Shape | Purpose |
|----|-------|---------|
| `$interpolate` | `{ $interpolate: { template: "Hello {{name}}", values: node } }` | String interpolation from object |
| `$dateAdd` | `{ $dateAdd: { date: node, amount: number, unit: "day"/"hour"/... } }` | Date arithmetic |
| `$dateDiff` | `{ $dateDiff: { from: node, to: node, unit: "day"/"hour"/... } }` | Date difference |
| `$not` | `{ $not: node }` | Boolean negation |
| `$and` | `{ $and: [node, ...] }` | Logical AND |
| `$or` | `{ $or: [node, ...] }` | Logical OR |
| `$type` | `{ $type: node }` | Returns type as string |
| `$length` | `{ $length: node }` | Array/string length |
| `$keys` | `{ $keys: node }` | Object keys |
| `$values` | `{ $values: node }` | Object values |
| `$fromEntries` | `{ $fromEntries: node }` | [key, value][] → object |
| `$pick` | `{ $pick: { from: node, keys: [string, ...] } }` | Pick object keys |
| `$omit` | `{ $omit: { from: node, keys: [string, ...] } }` | Omit object keys |
| `$trim` | `{ $trim: node }` | String trim |
| `$lower` | `{ $lower: node }` | Lowercase |
| `$upper` | `{ $upper: node }` | Uppercase |
| `$split` | `{ $split: { value: node, sep: string } }` | String split → array |
| `$replace` | `{ $replace: { value: node, search: string, replacement: string } }` | String replace |

---

## Compilation & IR

### CompileOptions

```typescript
type CompileOptions = {
  name?: string;           // Human label for the compiled artifact
  version?: string;        // Compiler version tag
};
```

### CompiledIr

```typescript
type CompiledIr = {
  irVersion: 1;
  compiler: { name: string; version: string };
  meta: {
    name?: string;
    createdAt: string;          // ISO 8601
    fingerprint: string;        // SHA256 of normalized config
    stats: {
      nodeCount: number;
      opCount: Record<string, number>;  // ops used and frequency
      maxDepth: number;
    };
  };
  tables: {
    paths: string[];           // All JSONPaths used (for cache priming)
    strings: string[];         // All string literals (for deduplication)
  };
  core: Config;                // Desugared config (sugar ops already resolved)
};
```

The IR is JSON-serializable. Store it in a database, send it over a wire, cache it in Redis. The `fingerprint` enables cache invalidation when configs change.

### Performance model

- `evaluate()`: validate → desugar → execute. Good for one-off transforms.
- `compile()` + `execute()`: validate → desugar → optimize → IR. Then `execute()` skips validation and desugaring. 2-5x faster for repeated execution of the same config against different source data.
- JSONPath parsing is cached (Map-based, primed from IR tables).

---

## Evaluation Context

```typescript
type EvalContext = {
  source: JsonObject;                    // Root source data
  vars: Record<string, unknown>;         // Variables from $with scopes
  path: string[];                        // Current evaluation path (for error reporting)
};
```

Context is immutable. Every scope change creates a new context via spread:

```typescript
const innerContext = { ...context, vars: { ...context.vars, [name]: value } };
```

---

## Error Model

```typescript
class PrismError extends Error {
  readonly code: string;
  readonly context?: {
    op?: string;
    path?: string;
    details?: Record<string, unknown>;
  };
}
```

Error codes:
- `E_SCHEMA` - Config failed Zod validation
- `E_MISSING_PATH` - JSONPath resolved to undefined
- `E_TYPE` - Wrong type for operation (e.g., $map.over is not array)
- `E_DIVISION_BY_ZERO` - Division by zero
- `E_DATE_INVALID` - Invalid date value or format
- `E_CIRCULAR_REF` - Circular variable reference detected

---

## File Structure

```
src/
├── index.ts                    # Public API (7 functions, schemas, types)
├── errors.ts                   # TransformError, error codes
├── schemas/
│   ├── index.ts                # Barrel: all schemas + types
│   ├── node.ts                 # NodeSchema (recursive union of all op schemas)
│   ├── config.ts               # ConfigSchema (top-level)
│   ├── ops/
│   │   ├── core.ts             # $ref, $const, $var, $get, $with
│   │   ├── array.ts            # $map, $filter, $reduce, $slice, etc.
│   │   ├── math.ts             # $add, $sub, $mul, $div, $round
│   │   ├── string.ts           # $join, $toString, $interpolate, etc.
│   │   ├── predicate.ts        # $eq, $neq, $gt, $empty, etc.
│   │   ├── logic.ts            # $not, $and, $or
│   │   ├── structure.ts        # $merge, $case, $coalesce, $keyBy, etc.
│   │   ├── object.ts           # $keys, $values, $pick, $omit, etc.
│   │   └── time.ts             # $date, $dateAdd, $dateDiff
│   └── guards.ts               # Type guard functions (isRefNode, etc.)
├── engine/
│   ├── evaluate.ts             # evaluateNode dispatcher + evaluate/evaluateSafe
│   ├── compile.ts              # Config → CompiledIr
│   ├── execute.ts              # CompiledIr + source → result
│   ├── validate.ts             # Config validation
│   └── documentation.ts        # JSON Schema generation
├── ops/
│   ├── index.ts                # Op registry (name → handler mapping)
│   ├── core/                   # ref.ts, const.ts, var.ts, get.ts, with.ts
│   ├── array/                  # map.ts, filter.ts, reduce.ts, etc.
│   ├── math/                   # add.ts, sub.ts, mul.ts, div.ts, round.ts
│   ├── string/                 # join.ts, to-string.ts, interpolate.ts, etc.
│   ├── predicate/              # eq.ts, gt.ts, empty.ts, etc.
│   ├── logic/                  # not.ts, and.ts, or.ts
│   ├── structure/              # merge.ts, case.ts, coalesce.ts, etc.
│   ├── object/                 # keys.ts, values.ts, pick.ts, omit.ts, etc.
│   └── time/                   # date.ts, date-add.ts, date-diff.ts
├── sugar/
│   ├── desugar.ts              # Main desugaring pass
│   ├── registry.ts             # Sugar op → rewrite function mapping
│   └── ops/                    # sum.ts, avg.ts, count.ts, pluck.ts, etc.
└── utils/
    ├── jsonpath.ts             # Parse + cache JSONPath expressions
    ├── math.ts                 # Numeric helpers
    └── predicates.ts           # Comparison helpers
```

---

## Op Handler Signature

Every operation handler follows the same signature:

```typescript
type OpHandler = (node: OpNode, context: EvalContext) => JsonValue;
```

The dispatcher in `evaluate.ts` checks for op keys and routes to the appropriate handler. This is a linear `if` chain (not a map lookup) because the type guards provide narrowing:

```typescript
export const evaluateNode = (node: Config, context: EvalContext): JsonValue => {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => evaluateNode(n, context));
  if (isRefNode(node)) return opRef(node, context);
  if (isMapNode(node)) return opMap(node, context);
  // ... etc
  // Plain object: evaluate each value recursively
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, evaluateNode(v, context)])
  );
};
```

---

## Dependencies

- `zod` (peer, ^4.0.0) - Schema validation
- `dayjs` (^2.0.0) - Date operations only. If dayjs is too heavy, consider `date-fns` tree-shakeable imports or native `Intl.DateTimeFormat`.

That's it. Two dependencies. The core evaluation engine has zero runtime dependencies.

---

## JSON Schema Generation

The library generates JSON Schema from its Zod schemas. This serves two purposes:

1. **LLM consumption** - An AI agent can read the JSON Schema to understand what operations are available and how to compose them.
2. **Editor integration** - VS Code and other editors can provide autocomplete for config files.

```typescript
export const getConfigJsonSchema = (target: 'jsonSchema7' | 'jsonSchema2019' | 'openApi3' = 'jsonSchema7'): object => {
  // Uses zod-to-json-schema internally
};
```

---

## Key Design Decisions

1. **Why a linear if-chain instead of a Map dispatch?** Type narrowing. Each `isXNode()` guard narrows the type, so the handler receives a correctly typed node without casts. A Map would require `as` casts or `unknown`.

2. **Why desugar before execution, not during?** Consistency. The desugared config is the canonical form. Compilation stores the desugared form. Error messages reference core ops, not sugar. One representation to reason about.

3. **Why JSONPath subset, not full JSONPath?** Simplicity. Full JSONPath includes filters (`$.items[?(@.price > 10)]`), recursive descent (`$..name`), and unions (`$.a,$.b`). These overlap with our `$filter`, `$map`, and `$merge` ops. The subset (`$.a.b[0].c`) covers path access; the ops cover everything else.

4. **Why SHA256 fingerprint on IR?** Cache invalidation. If you store compiled IRs keyed by name, the fingerprint tells you whether the config has changed since compilation. No need for version numbers or timestamps.

5. **Why `evaluate` AND `evaluateSafe`?** Different contexts. In a pipeline where failure is expected (user-provided configs), use `evaluateSafe`. In application code where the config is known-good, use `evaluate` and let errors propagate.
