# Vex Documentation

In-depth usage guide for `@niscorp/vex`. For the high-level pitch see
[README.md](./README.md); for architecture and rationale see
[DESIGN.md](./DESIGN.md).

## Contents

- [Concepts](#concepts)
- [Installation](#installation)
- [Creating an engine](#creating-an-engine)
- [Configuration reference](#configuration-reference)
- [The request/response contract](#the-requestresponse-contract)
- [Engine methods](#engine-methods)
- [The DSL](#the-dsl)
- [Scope policies](#scope-policies)
- [Caching](#caching)
- [Wiring the LLM agents](#wiring-the-llm-agents)
- [Framework adapters](#framework-adapters)
- [Events](#events)
- [Error handling](#error-handling)
- [Local development](#local-development)

---

## Concepts

**Request → shape, not query.** A caller sends an `intent` (optional natural
language), a `shape` (an example of the structure they want back), and a
`context` object (runtime values). They do not write SQL or even the DSL.

**The DSL is the intermediate.** Either you hand-write a DSL `Query` and call
`compile`/`test`/`execute`, or an LLM hook generates one from the request. The
DSL is validated by Zod before anything compiles it.

**Deterministic core.** Everything except DSL generation and result mapping is
pure and LLM-free: discover entities → apply scope → resolve to columns/joins →
analyze → compile to parameterized SQL → bind → execute. You can run this whole
path with no model and no network beyond the database.

**Shape caching.** The first request for a given shape generates and caches the
DSL (and any result mapping). Every later request with the same shape skips
generation entirely and re-runs only the deterministic path — so scope and
context stay current while LLM cost drops to zero.

**Scope is separate from context.** `context` is caller data, visible to the
agent and referenced via `{ $context: "key" }`. `scope` is server-side access
control, invisible to the agent, injected as filters via `{ $scope: "key" }`.
They are passed through different channels and must never be conflated.

---

## Installation

```bash
pnpm add @niscorp/vex zod
```

`zod` is the only required peer. Add the others for the paths you use:

```bash
pnpm add pg                                       # Postgres adapter + Postgres cache
pnpm add hono            # or: express            # framework adapter
pnpm add @niscorp/cortex @niscorp/signal @niscorp/prism  # reference LLM agents
```

For semantic (vector) search you need a Postgres with `pgvector` (the dev setup
uses the `pgvector/pgvector:pg16` image) and an embedding function wired onto the
engine — see [Semantic search](#semantic-search).

---

## Creating an engine

### Minimal (deterministic, no LLM)

```typescript
import pg from 'pg';
import { createQueryEngine, createPostgresAdapter } from '@niscorp/vex';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = createPostgresAdapter({ pool });

const engine = createQueryEngine({ adapter });

await engine.introspect(); // REQUIRED before compile/test/execute
```

`introspect()` discovers tables, columns, normalized types, relations, and
indexes, and caches the result plus a schema fingerprint. The engine throws
`execution_error` ("schema not loaded") if you call `compile`/`execute`/`test`
before introspecting.

With no `generateDsl` hook, `execute` serves only requests whose shape is
already cached (and otherwise throws `agent_failed`). `compile` and `test` work
fully because you pass them a DSL directly.

### With LLM-backed generation and mapping

```typescript
const engine = createQueryEngine({
  adapter,
  cache,                 // optional; defaults to in-memory
  scope: scopePolicy,    // optional
  onEvent: handler,      // optional
  generateDsl,           // natural language → DSL  (see "Wiring the LLM agents")
  mapToShape,            // raw rows → requested shape
});
await engine.introspect();
```

---

## Configuration reference

### `QueryEngineConfig`

```typescript
type QueryEngineConfig = {
  adapter: DatabaseAdapter;                 // required
  scope?: ScopePolicy;                      // server-side access control
  cache?: CacheBackend;                     // default: createMemoryCache()
  onEvent?: VexEventHandler;                // pipeline event stream
  generateDsl?: (request, schema) => Promise<Query>;
  mapToShape?: (rows, shape) => Promise<{ ir: CompiledIr; transformed: unknown[] }>;
  embed?: (text, dimensions?) => Promise<number[]>;  // text→vector for semantic filters
  config?: {
    maxNestingDepth?: number;               // default: 2
    defaultLimit?: number;                   // default: 100
    maxLimit?: number;                        // default: 1000
    rejectCartesianProducts?: boolean;       // default: true
    warnUnindexedFilters?: boolean;          // default: true
    rejectUnindexedFilters?: boolean;        // default: false
    entities?: string[];                     // whitelist for introspection
    unsatisfiableTtlMs?: number;             // negative-cache TTL, default 300_000 (5 min)
  };
};
```

- `config.entities`, when set, restricts `introspect()` to those tables.
- `defaultLimit` is applied when a DSL omits `limit`; `maxLimit` clamps any
  larger value.
- **`embed`** turns text into a vector for `semantic` filters, at parameter-
  binding time. It's an injected provider (wire it to Signal) — *not* a database
  concern, so it lives on the engine, not the adapter (the adapter only emits the
  vector-distance SQL). Required only if your schema has vector columns you
  search over.

### `ExecuteOptions`

```typescript
type ExecuteOptions = {
  scope?: ScopeValues;        // { [key]: value } for $scope references
  cache?: CacheMode;          // 'use' (default) | 'refresh' | 'bypass' | 'only'
  entities?: string[];        // restrict generation to this entity subset for this call
};
```

Scope filters are injected only when **both** a `scope` policy is configured and
`options.scope` values are provided.

---

## The request/response contract

### Request

```typescript
type QueryRequest = {
  intent?: string;                      // natural language (drives the agent)
  shape: unknown;                        // example of the desired output structure
  context?: Record<string, unknown>;     // runtime values for { $context } refs (default {})
};
```

The request is Zod-validated; `execute` throws `invalid_request` on failure.
`shape` is required in practice — the framework handlers reject a missing shape
with a 400.

The **shape** is an example, not a schema: use empty strings, zeros, and
booleans as type markers. `[{ id: '', total: 0 }]` means "an array of objects
with a string `id` and a number `total`." A bare object means a single object.

### Response

```typescript
type QueryResponse = {
  result: Row[];                         // rows, mapped to the requested shape if mapping ran
  meta: {
    cache: { hit: boolean; key?: string };       // key is the shape hash
    context: Record<string, {                      // the resolved parameter contract
      type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]';
      kind: 'context' | 'scope' | 'semantic';
    }>;
    timing?: { agentMs?: number; executionMs: number; mappingMs?: number };
    warnings?: string[];                  // analyzer warnings, if any
    missingContext?: string[];            // present when required keys were not supplied
  };
};
```

If the compiled query needs context/scope values the caller did not provide,
`execute` returns a **valid** response with an empty `result` and
`meta.missingContext` listing the missing keys — it does not throw. Retry with
the values filled in. `meta.context` always describes the full parameter
contract so a caller knows what to provide.

---

## Engine methods

```typescript
type QueryEngine = {
  introspect: () => Promise<DatabaseSchema>;
  execute: (request: QueryRequest, options?: ExecuteOptions) => Promise<QueryResponse>;
  compile: (dsl: Query, scope?: ScopeValues) => CompiledQuery;
  test: (dsl: Query, scope?: ScopeValues) => Promise<TestResult>;
  getDslSchema: () => object;
  getSchema: () => DatabaseSchema | undefined;
  cache: CacheBackend;
};
```

- **`introspect()`** — discover and cache the schema + fingerprint. Call once at
  startup (and again after a schema migration).
- **`execute(request, options)`** — the full pipeline described in DESIGN.md.
- **`compile(dsl, scope?)`** — run the deterministic pipeline (clamp limit →
  discover → scope → resolve → analyze → adapter compile) and return the
  `CompiledQuery` (`{ sql, paramSlots, contextContract }`). No execution, no
  LLM. Throws `invalid_dsl` if the analyzer finds errors.
- **`test(dsl, scope?)`** — compile with `limit` forced to 5, build synthetic
  context values, execute, and return `{ rows, warnings, errors }`. Errors are
  caught and returned in `errors` rather than thrown. Useful for validating a
  hand-written DSL against real data.
- **`getDslSchema()`** — the DSL as a JSON Schema (draft-7). This is what you
  feed an LLM so it learns the DSL.
- **`getSchema()`** — the last introspected `DatabaseSchema`, or `undefined`.
- **`cache`** — the live `CacheBackend` for inspection or manual eviction.

---

## The DSL

A `Query` is a constrained JSON object. The model never produces SQL — it fills
this in, and the schema's `.describe()` annotations teach it how.

```typescript
type Query = {
  from: Source[];                                  // min 1
  fields: string[];                                // min 1, "entity.field" — required
  filter?: Filter;
  compute?: Record<string, ComputeExpression>;     // alias → expression
  aggregate?: Record<string, AggregateExpression>; // alias → function
  groupBy?: string[];
  sort?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  distinct?: boolean;
};

type Source = string | { as: string; query: Query };  // entity name or subquery
```

### Fields

Always `entity.field`. There is no `SELECT *` — `fields` is required and must
list at least one path. Every entity referenced anywhere in the query must also
appear in `from`.

```json
{ "from": ["order"], "fields": ["order.id", "order.total", "order.createdAt"] }
```

### Filters

```typescript
// Comparison — both sides are field paths, literals, or { $context }/{ $scope }
{ eq:  [a, b] }  { neq: [a, b] }
{ gt:  [a, b] }  { gte: [a, b] }
{ lt:  [a, b] }  { lte: [a, b] }

// Collection — first arg is a field path; second is an array or a ref
{ in:    ["entity.field", [v1, v2]] }
{ notIn: ["entity.field", { $context: "ids" }] }

// String pattern (% wildcard)
{ like:  ["entity.field", "%abc%"] }    // case-sensitive
{ ilike: ["entity.field", "%abc%"] }    // case-insensitive

// Null
{ isNull: "entity.field" }
{ isNotNull: "entity.field" }

// Logic ('and'/'or' require ≥ 2 conditions)
{ and: [f1, f2, ...] }
{ or:  [f1, f2, ...] }
{ not: f }

// Semantic vector similarity (query MUST be a $context/$scope ref)
{ semantic: { field: "product.embedding", query: { $context: "search" }, minScore?: 0.7 } }

// Fuzzy string match (Levenshtein)
{ fuzzy: { field: "customer.name", query: { $context: "q" }, maxDistance?: 2 } }
```

There is intentionally **no** `offset` (use a cursor: `{ gt: ["entity.id",
{ $context: "cursor" }] }`) and **no** `between` (use `{ and: [{ gte }, { lte }] }`).

### Values

```typescript
"order.status"            // a field path — any string in "entity.field" form (a dot, not at either end)
"published"               // a literal string — any string without a usable dot
42, true, null            // literals
{ $context: "userId" }    // caller-provided value, from request.context
{ $scope: "accountId" }   // server-injected value, from options.scope
```

The resolver distinguishes a field path from a literal string purely by the
`entity.field` shape (a dot that is neither the first nor last character). So
`"order.status"` resolves to a column, while `"published"` is a literal value.

### Compute

Record of `alias → expression`. The alias is the output key.

```json
{
  "compute": {
    "total":       { "add": ["order.price", "order.tax"] },
    "displayName": { "coalesce": ["user.nickname", "user.name"] },
    "tier":        { "case": {
      "when": [{ "condition": { "gte": ["order.total", 100] }, "then": "premium" }],
      "else": "standard"
    } }
  }
}
```

Operators: `add`, `subtract`, `multiply`, `divide` (binary), `concat`,
`coalesce` (≥ 2 args), `case` (`when[]` of `{ condition, then }` + `else`).

### Aggregates

Record of `alias → function`. Pair with `groupBy` for grouped results;
without it the analyzer warns and you get a single aggregated row.

```json
{
  "from": ["order"],
  "fields": ["order.customerId"],
  "aggregate": { "revenue": { "sum": "order.total" }, "orders": { "count": "*" } },
  "groupBy": ["order.customerId"]
}
```

Functions: `count` (field path or `"*"`), `sum`, `avg`, `min`, `max`.

### Subqueries

A `from` entry can be `{ as, query }`. Nesting is bounded by
`config.maxNestingDepth` (default 2). Scope, discovery, and resolution all
recurse into subqueries.

### Semantic search

`{ semantic: { field, query } }` needs three things wired up: a `vector` column
in the schema, an HNSW or IVFFlat index on it (else the analyzer warns it will
be slow), and an `embed` function on the engine:

```typescript
import { createSignal } from '@niscorp/signal';

const embedder = createSignal('openai').model('text-embedding-3-small');
const engine = createQueryEngine({
  adapter,
  embed: (text, dimensions) =>
    embedder.embed(text, dimensions ? { dimensions } : undefined),
});
```

At execution, the `query` ref's text is read from context, embedded, and bound
as the vector parameter. (Never select a vector column directly in `fields` — it
is for `semantic` filters only.)

---

## Scope policies

Server-side, LLM-invisible access control. A policy maps entity names to rules;
matched rules become filter clauses bound to `$scope` values and AND-merged into
the DSL after generation.

```typescript
type ScopePolicy = {
  default: 'allow' | 'deny';                  // for entities with no explicit rule
  entities: Record<string, ScopeEntityRule>;
};

type ScopeEntityRule =
  | { public: true }                           // accessible, no filtering
  | { deny: true }                             // never accessible
  | ScopeFilterRule
  | ScopeFilterRule[];                         // multiple rules, AND-combined

type ScopeFilterRule = {
  field: string;                               // entity field to constrain
  source: string;                              // key in options.scope to bind
  op?: 'eq' | 'in' | 'neq';                    // default: 'eq'
};
```

Example:

```typescript
const scope: ScopePolicy = {
  default: 'deny',
  entities: {
    order:    { field: 'accountId', source: 'accountId' },
    customer: { field: 'accountId', source: 'accountId' },
    country:  { public: true },
    secret:   { deny: true },
  },
};

const engine = createQueryEngine({ adapter, scope });

await engine.execute(request, { scope: { accountId: 'acc-99' } });
```

Behavior:

- A discovered entity with **no rule** under `default: 'deny'` throws
  `VexScopeError` (`scope_denied`). Under `default: 'allow'` it passes through
  unfiltered.
- `{ public: true }` passes through; `{ deny: true }` throws.
- A filter rule injects e.g. `{ eq: ["order.accountId", { $scope: "accountId" }] }`.
  `op: 'in'` handles "belongs to many" (e.g. multiple orgs); an array of rules
  AND-combines them.
- If a scope-bound `$scope` key is missing from `options.scope`, it surfaces via
  `meta.missingContext` (the response is empty but valid), not a thrown error.

Scope is applied only when a policy is configured **and** `options.scope` is
provided.

---

## Caching

### Cache modes (`options.cache`)

| Mode | Read cache | Generate on miss | Write cache |
|------|-----------|------------------|-------------|
| `use` (default) | yes | yes | yes |
| `refresh` | no | yes | yes (overwrite) |
| `bypass` | no | yes | no |
| `only` | yes | no — throws `cache_miss` on miss | no |

`use` also enables single-flight: concurrent identical misses collapse to one
generation. `refresh`/`bypass` opt out.

### How keys work

- **Positive cache** is keyed by **shape hash** — the shape with values replaced
  by type tokens, keys sorted, arrays collapsed to first-element shape, then
  SHA-256. Same shape, different values → same key. (`meta.cache.key`.)
- **Negative cache** ("unsatisfiable") is keyed by **request hash** — intent +
  shape + the *names* of context keys (values excluded). A `cannotSatisfy`
  result is cached here with a TTL (`config.unsatisfiableTtlMs`, default 5 min)
  so an impossible request isn't re-run until it expires.
- Every entry stores a **schema fingerprint**. After a schema change the
  fingerprint no longer matches and the entry is treated as a miss and evicted —
  its cached DSL might reference columns that changed.

### Backends

```typescript
import {
  createMemoryCache,
  createPostgresCache,
  createTieredCache,
} from '@niscorp/vex';
```

**In-memory** (default) — a `Map`. Fast, volatile, single-process.

```typescript
const cache = createMemoryCache();
```

**Postgres** — durable L2. Stores entries as `jsonb`, enforces TTL server-side,
validates on write, and evicts corrupt/stale rows on read. Used directly it
reads from Postgres on every `get`, so it is meant to sit behind an L1.

```typescript
const l2 = createPostgresCache({
  pool,
  schema: 'public',        // default
  table: 'vex_cache',      // default
  onError: (err) => console.error(err),
});
await l2.init();           // CREATE SCHEMA/TABLE IF NOT EXISTS
```

**Tiered** — L1 (memory) + L2 (durable), read-through/write-through. Reads hit
L1; on an L1 miss it promotes a validated L2 entry into L1. Writes go to L1
synchronously and L2 fire-and-forget.

```typescript
const cache = createTieredCache({
  l1: createMemoryCache(),
  l2: createPostgresCache({ pool }),
  warmup: 'full',          // 'full' (default) | 'lazy' | { mode: 'partial', shapes: [...] }
  onError: (err) => console.error(err),
});
await cache.init();        // runs L2/L1 init + warm-up

const engine = createQueryEngine({ adapter, cache });
```

Warm-up modes: `full` loads all of L2 into L1 at startup; `lazy` fills L1 on
demand; `partial` preloads only the listed shapes (by example shape) and lazy-
fills the rest. The tiered cache is single-instance: separate processes keep
separate L1s.

---

## Wiring the LLM agents

The engine consumes two hooks. Both are optional; supply them to answer
free-form requests.

```typescript
type GenerateDsl = (request: QueryRequest, schema: DatabaseSchema) => Promise<Query>;
type MapToShape  = (rows: Row[], shape: unknown) =>
  Promise<{ ir: CompiledIr; transformed: unknown[] }>;
```

- `generateDsl` runs on a cache miss; it must return a DSL that passes
  `QuerySchema`. To signal an impossible request, throw
  `new VexError('unsatisfiable', reason)` — the runtime negative-caches it.
- `mapToShape` runs when the requested shape differs from the raw rows; it
  returns a compiled Prism `ir` (cached for reuse) plus the transformed rows.

You can implement these however you like. Vex also ships a **reference
implementation** built on `@niscorp/cortex` and `@niscorp/prism`, exported from
the `@niscorp/vex/agent` subpath (`@niscorp/cortex`, `@niscorp/signal`, and
`@niscorp/prism` become required peers only if you import it):

```typescript
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { createSignal } from '@niscorp/signal';

const schema = await engine.introspect();
const queryJsonSchema = engine.getDslSchema();

const llm = createSignal('openrouter', { apiKey, model: 'openai/gpt-oss-120b' });

const generateDsl = createQueryDsl({ adapter, llm, schema, queryJsonSchema });
const mapToShape  = createShapeMapper(llm);

const engine = createQueryEngine({ adapter, generateDsl, mapToShape, cache });
await engine.introspect();
```

- `createQueryDsl(config)` builds the `generateDsl` hook by running
  `vexQueryDslAgent`.
- `createShapeMapper(llm)` builds the `mapToShape` hook by running Prism's
  `mappingAgent`. The `@niscorp/vex/agent` subpath also exports `vexQueryDslAgent`
  itself, plus the building blocks (`createQueryTools`, `queryRules`,
  `createQueryProducers`) for customizing tools or rules.

The reference query agent (`vexQueryDslAgent`, id `vex.query`) is a
structured-output Cortex agent over `QuerySchema` with six tools and two rules:

| Tool | Input | Purpose |
|------|-------|---------|
| `getSchema` | `{ entities? }` | Read the schema (optionally a subset) |
| `getSampleRows` | `{ entity, limit? }` | See real rows (default 5) |
| `getDistinctValues` | `{ entity, field, limit? }` | Field cardinality (default 20) |
| `describeField` | `{ entity, field }` | type, nullable, cardinality, null count, min/max |
| `testQuery` | `{ dsl }` | Validate + compile + execute with synthetic params (LIMIT 5) |
| `cannotSatisfy` | `{ reason }` | Declare the request impossible (aborts the run) |

Rules: a tool-call limiter (nudge to finalize at 8, abort at 10) and an abort on
`cannotSatisfy`. All data-touching tools respect the scope policy. (If you build
your own generator, none of this applies — only the `Query` you return matters.)

---

## Framework adapters

Vex does not own a server, but ships thin adapters that expose a resource with a
discovery endpoint (`GET`) and a query endpoint (`POST`). Both are optional
sub-exports.

### Hono

```typescript
import { Hono } from 'hono';
import { vex } from '@niscorp/vex/hono';

const app = new Hono();

app.route('/api/orders/vex', vex({
  engine,
  entities: ['orders', 'order_items'],         // optional: restrict this resource
  getScope: async (c) => ({ accountId: await resolveAccount(c) }),
}));
```

### Express

```typescript
import express from 'express';
import { vex } from '@niscorp/vex/express';

const app = express();
app.use(express.json());

app.all('/api/orders/vex', vex({
  engine,
  entities: ['orders', 'order_items'],
  getScope: (req) => ({ accountId: req.user.accountId }),
}));
```

### The endpoints

- **`GET`** → discovery JSON: `vex` protocol version, description, the filtered
  entities (fields, relations, row counts), the request body contract, the
  `cache` query-param options, and the full DSL JSON Schema. A client or agent
  can read this to learn how to query the resource.
- **`POST`** → runs a query. Body is the `QueryRequest`; the `?cache=` query
  param selects the cache mode (`use`/`refresh`/`bypass`/`only`); scope comes
  from `getScope`. Returns `{ status, body }` mapped to the HTTP response —
  `VexError`s become 400 with `{ error, message, details }`, unexpected errors
  become 500.

Under the hood both call the framework-agnostic `handleDiscovery` /
`handleQuery` from `handler.ts`, which you can use directly with any framework.

---

## Events

Pass `onEvent` to observe the pipeline. Every event is a discriminated union
member on `type`:

```typescript
import type { VexEvent } from '@niscorp/vex';

const onEvent = (e: VexEvent) => {
  switch (e.type) {
    case 'query.start':  /* intent, shape, cache, hash, entities */ break;
    case 'query.cache':  /* hit */ break;
    case 'query.dsl':    /* dsl, agentMs */ break;
    case 'query.sql':    /* sql, warnings */ break;
    case 'query.rows':   /* count, executionMs */ break;
    case 'query.mapped': /* mappingMs */ break;
    case 'query.done':   /* totalMs */ break;
    case 'query.error':  /* code, message */ break;
    // llm.request / llm.response — only if you emit them from your LLM wrapper
  }
};

const engine = createQueryEngine({ adapter, onEvent });
```

The `llm.request`/`llm.response` variants exist for callers that wrap their LLM
client to record a transcript (the dev server does this to write a full debug
log); the engine itself emits the `query.*` events.

---

## Error handling

`execute` throws `VexError` on failure (the framework handlers convert these to
HTTP responses). Missing context is **not** an error — it returns an empty
response with `meta.missingContext`.

```typescript
import { VexError } from '@niscorp/vex';

try {
  const res = await engine.execute(request, { scope });
} catch (err) {
  if (err instanceof VexError) {
    // err.code, err.message, err.details
  }
}
```

`VexError.code` is one of:

| Code | Meaning |
|------|---------|
| `invalid_request` | The request failed Zod validation |
| `invalid_dsl` | The analyzer rejected the resolved query (cartesian product, nesting, etc.) |
| `missing_scope` | A required scope value was absent (reserved) |
| `scope_denied` | An entity is denied by the scope policy (`VexScopeError`) |
| `missing_context` | A required context value was absent (reserved; normally surfaced via `meta.missingContext`) |
| `execution_error` | Schema not loaded, or a database/runtime failure |
| `agent_failed` | No `generateDsl` hook and no cached DSL for the shape |
| `cache_miss` | Cache mode `only` and nothing cached |
| `unsatisfiable` | The agent declared the request impossible (negative-cached) |

---

## Local development

The package ships a Postgres-backed dev environment and a runnable HTTP server.

### Database

```bash
pnpm --filter @niscorp/vex docker:up     # pgvector/pgvector:pg16 on host port 5433
pnpm --filter @niscorp/vex seed          # idempotent schema + sample data
pnpm --filter @niscorp/vex docker:down
```

The dev database is `vex_dev` (user/pass `vex`/`vex`), exposed on **5433** to
avoid clashing with a local 5432. `scripts/init.sql` runs on first boot; `seed`
loads a realistic schema (customers, orders, products, categories, reviews, …)
including a vector column for semantic search.

### Environment

`.env` (see `.env.example`):

```bash
OPENROUTER_API_KEY=     # enables the query + mapping agents
OPENAI_API_KEY=         # enables embeddings (text-embedding-3-small) for semantic search
```

The dev server also reads `DATABASE_URL` (default
`postgresql://vex:vex@localhost:5433/vex_dev`), `PORT` (default 3456), and
`VEX_CACHE` (`memory` | `postgres`) with `VEX_CACHE_SCHEMA` / `VEX_CACHE_TABLE`.

### Run the server

```bash
pnpm --filter @niscorp/vex dev:server
```

It seeds if needed, introspects, wires the reference agents when
`OPENROUTER_API_KEY` is set (falling back to deterministic-only otherwise),
mounts several scoped resources via the Hono adapter, and logs per-stage timing
to the console and a full LLM transcript to `logs/vex-debug.log`. `GET` any
endpoint for discovery; `POST` to query.

### Tests

```bash
pnpm --filter @niscorp/vex test
```

Unit tests (schemas, discovery, scope, hashing, resolver, analyzer) need no
database or LLM. Integration tests (introspection, compilation, execution, cache
backends, handlers) run against the seeded Postgres.
