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
- [Mutations](#mutations)
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

**Fingerprint caching.** Every generation is cached under a **fingerprint** —
server-minted (`fp_…`, returned in `meta.cache.fingerprint`) or caller-chosen
(a name like `deals/list`). Replaying a fingerprint skips generation entirely
and re-runs only the deterministic path — so scope and context stay current
while LLM cost drops to zero. A minted fingerprint is an immutable pin; a
named one is a mutable slot whose content follows your request. Design and
rationale: [DESIGN.md](./DESIGN.md) **Cache v2 — fingerprints**.

**Scope is separate from context.** `context` is caller data, visible to the
agent and referenced via `{ $context: "key" }`. `scope` is server-side access
control, invisible to the agent, injected as filters via `{ $scope: "key" }`.
They are passed through different channels and must never be conflated.

**Writes are replay-only, same wire.** A mutation is a dev-authored cache
entry (`kind: 'mutation'`) invoked exactly like a read replay —
`{ fingerprint, context }` — and the entry's kind picks the pipeline. The
def never travels and no generation path exists for writes. See
[Mutations](#mutations).

**Reserved sort keys.** `sortBy` (an `entity.field`) and `sortDir` (`asc`/`desc`)
are reserved keys in `context`: the engine reads them straight into the `ORDER BY`
(the column is schema-validated), overriding the query's literal `sort` for that
run. They drive sorting directly and are never bound as parameters.

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
  mapToShape?: (rows, shape) => Promise<{ ir: CompiledIr; transformed: JsonValue }>;
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
  entities?: string[];        // restrict generation to this entity subset for this call
  locked?: boolean;           // replay-only: unknown/changed fingerprints throw `locked` instead of generating
};
```

There is no cache mode — the request body itself expresses
replay/generate/replace semantics via its `fingerprint` field (see the
request contract below).

Scope filters are injected only when **both** a `scope` policy is configured and
`options.scope` values are provided.

---

## The request/response contract

### Request

```typescript
type QueryRequest = {
  fingerprint?: string;                  // the cache identity (see postures below)
  intent?: string;                       // natural language (drives the agent)
  shape?: unknown;                       // example of the desired output structure
  context?: Record<string, unknown>;     // runtime values for { $context } refs; reserved `sortBy`/`sortDir` drive ORDER BY (default {})
};
```

The request is Zod-validated; `execute` throws `invalid_request` on failure.
It must carry a `fingerprint`, a `shape`, or both — the three postures:

1. **Explore** — `{ intent, shape, context }`: generate, cache, mint a
   fingerprint (`fp_…`, returned in `meta.cache.fingerprint`).
2. **Replay** — `{ fingerprint, context }`: serve the stored entry; never
   generates. Unknown fingerprint → `cache_miss`. Context values may vary per
   call (they are runtime data, not identity).
3. **Own a slot** — `{ fingerprint, intent, shape, context }`: hit when the
   stored request matches (intent + normalized shape + context key names),
   regenerate and REPLACE the slot when it differs
   (`meta.cache.replaced: true`) — unless the entry is `protected` → throws
   `fingerprint_protected`.

The **shape** is an example, not a schema: use empty strings, zeros, and
booleans as type markers. `[{ id: '', total: 0 }]` means "an array of objects
with a string `id` and a number `total`." A bare object means a single record.

The shape also picks the result envelope: an **array** shape maps over the whole
row set (the mapping sees `$.result` as the rows array — a `$map`/identity); a
**non-array** shape maps the single (first) row (the mapping sees `$.result` as
that row, so a detail reads `$.result.field`). So the mapping — not Vex — owns
the output: array, single object, or scalar. On a fingerprint-only replay the
entry's STORED shape drives this — the caller sends none.

### Response

```typescript
type QueryResponse = {
  result: JsonValue;                     // the mapping's output (array / object / scalar); raw Row[] if no mapping
  meta: {
    cache: {
      hit: boolean;
      fingerprint?: string;   // the entry's identity — minted or your name
      replaced?: boolean;     // true when a named slot was regenerated + replaced
      intent?: string;        // the stored intent (descriptive only)
    };
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
  fields?: FieldRef[];                             // optional with `aggregate`; "entity.field" or { field, as }
  filter?: Filter;
  compute?: Record<string, ComputeExpression>;     // alias → expression
  aggregate?: Record<string, AggregateExpression>; // alias → function
  groupBy?: string[];
  sort?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  distinct?: boolean;
};

type Source   = string | { as: string; query: Query };  // entity name or subquery
type FieldRef = string | { field: string; as: string }; // bare column, or aliased output key
```

### Fields

Each entry is `entity.field`, or `{ field, as }` to set a distinct output key
(so three joined `name` columns can become `company` / `stage` / `owner`
without a compute). There is no `SELECT *`. `fields` is **optional** — omit it
for an aggregate-only query (e.g. a bare `COUNT(*)`); a query must have at least
one of `fields` / `aggregate`. Every entity referenced anywhere must also appear
in `from`.

```json
{ "from": ["order", "customer"],
  "fields": ["order.id", "order.total", { "field": "customer.name", "as": "customer" }] }
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

Record of `alias → function`. Pair with `groupBy` for grouped results; without
it the analyzer warns and you get a single aggregated row. Omit `fields` for an
aggregate-only query (a bare count):

```json
{ "from": ["order"], "aggregate": { "orders": { "count": "*" } } }
```

`sum` / `avg` / `min` / `max` take a field path **or a compute expression**, so
you can aggregate a derived value (no extra column needed):

```json
{
  "from": ["order", "stage"],
  "aggregate": { "weighted": { "sum": { "multiply": ["order.value", "stage.win_probability"] } } },
  "filter": { "eq": ["order.status", "open"] }
}
```

Grouped, with a renamed field:

```json
{
  "from": ["order", "customer"],
  "fields": [{ "field": "customer.name", "as": "customer" }],
  "aggregate": { "revenue": { "sum": "order.total" }, "orders": { "count": "*" } },
  "groupBy": ["customer.name"]
}
```

Functions: `count` (field path or `"*"`); `sum` / `avg` / `min` / `max` (a field
path or a compute expression).

### Subqueries

A `from` entry can be `{ as, query }`. Nesting is bounded by
`config.maxNestingDepth` (default 2). Scope, discovery, and resolution all
recurse into subqueries. A subquery's output columns are referenceable from the
outer query as `alias.field` — every selected field (under its `as`, if
aliased) plus every `compute`/`aggregate` alias.

**Joins.** String entity sources are joined automatically by foreign key; a
source with no FK path to the others is an error. A **nullable** FK compiles to
a `LEFT JOIN` — a null FK never silently drops the referencing row from the
read (the joined fields come back null); a non-nullable FK stays an inner
`JOIN` (equivalent — the column can't be null). Reverse one-to-many joins are
inner by design (rows multiply per child). Subquery sources are **never**
FK-joined — any beyond the first are `CROSS JOIN`ed. That makes a row of
independent aggregates expressible: cross-join N single-row `COUNT(*)`
subqueries and select each one's count, and you get one row with N counts in a
single read (use an object shape so Vex maps that single row).

```json
{ "from": [{ "as": "c",  "query": { "from": ["contact"], "aggregate": { "n": { "count": "*" } } } },
           { "as": "co", "query": { "from": ["company"], "aggregate": { "n": { "count": "*" } } } }],
  "fields": [{ "field": "c.n", "as": "contacts" }, { "field": "co.n", "as": "companies" }] }
```

(Limitation: subquery SQL params are embedded verbatim, so at most one bound
`$context`/`$scope` param across all subqueries is supported today.)

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

Server-side, LLM-invisible access control, applied to the resolved query/mutation
*after* it is authored — so a generated or injected DSL can never reference,
dodge, or forge it. Two roles, named for the SQL they produce:

- **`match`** (RLS) — the row's column must equal a scope value. A `WHERE` filter
  on read/update/delete; on insert the column is pinned to that value.
- **`set`** (identity) — the engine writes the column from a scope value on every
  column-writing mutation: insert values and update set alike (`write` means every
  write; delete writes no columns, so it is structurally exempt).

```typescript
type ScopePolicy = {
  default: 'allow' | 'deny';                  // fallback for unlisted entities / absent phases
  entities: Record<string, ScopeEntityRule>;
};

type ScopeEntityRule =
  | { public: true }                          // fully open
  | { deny: true }                            // fully closed
  | {
      read?:   ScopeMatch[];                  // SELECT WHERE (match only)
      write?:  (ScopeMatch | ScopeSet)[];     // UMBRELLA — grants + rules for insert/update/delete
      insert?: (ScopeMatch | ScopeSet)[];     // specific: just INSERT, rules stack on write's
      update?: (ScopeMatch | ScopeSet)[];     // specific: just UPDATE, rules stack on write's
      delete?: ScopeMatch[];                  // specific: just DELETE (match only — nothing to set)
    };

type ScopeMatch = { match: string; to: string };  // row.<match> = scope[to]
type ScopeSet   = { set:   string; to: string };   // INSERT/UPDATE row.<set> := scope[to]
```

Example:

```typescript
const scope: ScopePolicy = {
  default: 'deny',
  entities: {
    order:   { read:  [{ match: 'accountId', to: 'accountId' }],
               write: [{ match: 'accountId', to: 'accountId' }, { set: 'owner_id', to: 'userId' }] },
    country: { public: true },
    secret:  { deny: true },
  },
};

const engine = createQueryEngine({ adapter, scope });
await engine.execute(request, { scope: { accountId: 'acc-99', userId: 'u-1' } });
```

Behavior:

- The query engine enforces the **`read`** rules: each `match` becomes
  `{ eq: ["order.accountId", { $scope: "accountId" }] }`, AND-merged into the DSL.
- `default` covers a discovered entity with no rule *and* a listed entity with no
  matching phase: `'deny'` throws `VexScopeError` (`scope_denied`), `'allow'`
  passes through unfiltered. `{ public: true }` passes; `{ deny: true }` throws.
- The write phases are the contract for a mutation executor (the query engine
  is read-only). **`write`** is the umbrella: its presence grants insert, update
  and delete, and its rules apply to all of them. **`insert`**/**`update`**/**`delete`**
  are specific phases: each grants just its op, its rules stacking on the
  umbrella's (`delete` is match-only — nothing to set). Rule mechanics: `match`
  filters update/delete and pins the column on insert; `set` writes the column
  on insert AND update. Applied server-side, never authored in the mutation
  — so identity/ownership can't be forged.
- A missing `$scope` key surfaces via `meta.missingContext` (empty-but-valid), not
  a thrown error.
- `match` is equality today; an `op` for `in` / multi-valued boundaries is additive
  when a real one appears.

Scope is applied only when a policy is configured **and** `options.scope` is
provided.

---

## Mutations

Writes are first-class and deliberately narrower than reads: **no generation
path exists.** A mutation is authored by a developer, seeded into the cache
as a `kind: 'mutation'` entry under a named fingerprint (normally
`protected`), and replayed over the same wire shape reads use. An inline
`{ mutation }` body is not a request shape at all.

### The grammar

Four ops, closed and strict. Values are literals or `{ $context: "key" }` —
**never `$scope`** (identity is engine-injected, unforgeable) and never a
field path. `update`/`delete` REQUIRE a `where` (a real vex `Filter`).

```ts
{ op: 'insert', table: 'tasks', values: { title: { $context: 'title' } } }
{ op: 'update', table: 'tasks', set: { done: { $context: 'done' } },
  where: { eq: ['tasks.id', { $context: 'id' }] } }
{ op: 'delete', table: 'tasks', where: { eq: ['tasks.id', { $context: 'id' }] } }
// sugar — insert-or-update keyed on `key`; `insert` columns apply on create only
{ op: 'upsert', table: 'tasks', key: 'id',
  columns: { title: { $context: 'title' } },
  insert: { deal_id: { $context: 'deal_id' } } }
```

An array of ops is a batch and runs in ONE transaction (the client must
expose `transaction`; a batch on a non-transactional client is refused).

### Replay

The handler dispatches by the entry's kind — one wire shape:

```
POST { "fingerprint": "tasks/setDone", "context": { "id": "task_1", "done": true } }
→ 200 { "result": <affected row — or rows for a batch/bulk write> }
```

The pipeline per statement: parse → desugar → **require context** (a write
never executes with holes — missing keys are a hard 400 `missing_context`
whose `details.expected` carries the FULL derived signature) → scope (the
same `ScopePolicy` reads use: `write` `set` rules write identity on insert
and update, `match` rules pin rows) → column check against the introspected schema →
compile (parameterized, via the read pipeline's own operators) → execute
with `RETURNING *`.

Enable replay on a handler by configuring the client and policy:

```ts
handleQuery({ engine, locked: true, mutations: { client: db, policy } }, body, scope);
```

`client` is structural (`MutationClient` — PGlite, a pg wrapper, a test
double). `locked` does not affect writes: they are replay-only under every
posture. Direct library use: `executeMutation(client, def, { context, scope, policy, schema })`.

A host that resolves a policy **per principal** (e.g. compiled from an ACL
layer) passes it per request: `VexHandlerConfig.scopePolicy` overrides the
engine's configured read policy for that request (`ExecuteOptions.scopePolicy`
at the library level), and the same policy goes in `mutations.policy` — one
policy, both sides of the wire. Omitted, the engine default applies.

### Derived context signatures

The input contract of ANY entry — read or write — is computed from its
stored def: each `{ $context }` ref sits at a position whose column the
schema types. Discovery lists it per fingerprint (`context`, plus `shape`
for reads / `effect` = `{ op, table, columns }` for writes), and the
`missing_context` error teaches it. Nothing is authored; nothing drifts.

```ts
collectMutationContext(def, schema);  // { id: { type: 'string', column: 'tasks.id', note: 'upsert key — …' }, … }
collectQueryContext(dsl, schema);     // same idea over a query's filter/compute/subqueries
mutationEffect(def);                  // [{ op: 'update', table: 'tasks', columns: ['done'] }]
```

### Authoring lint

`lintMutation(def)` flags an `update`/`delete` whose WHERE binds no
`$context` — such a write is not caller-bounded (its only row limit is the
scope policy). Run it in your seed path so an unkeyed write never ships:
loud at boot, never at runtime.

---

## Caching

### Fingerprints — the one identity

The positive cache is keyed by the request's `fingerprint` (see the request
contract above). There are no cache modes — the body's posture says
everything:

- **No fingerprint** → generate, cache, mint (`fp_…`). The mint is an
  immutable pin: embed it and replay that exact generation forever.
- **Fingerprint alone** → replay-or-`cache_miss`. Never generates. Context
  values may vary per call — sorting and parameterized reloads are legal
  against one cached DSL.
- **Fingerprint + request** → a named slot: hit when the stored request
  matches, regenerate-and-replace when it differs; `protected` entries throw
  `fingerprint_protected` instead of being replaced.

Concurrent identical generations collapse to one (single-flight, keyed by the
request hash).

### Lifetime and protection

- Every replay stamps `lastUsedAt`; `sweepCache(cache, { maxIdleMs })` evicts
  entries idle past the limit, skipping protected ones. Alive = used.
- `protected: true` is written only by a seed path or an explicit
  `handleFingerprintPatch` — never by a runtime query.
- `ExecuteOptions.locked` (and `VexHandlerConfig.locked`) makes an engine call
  or endpoint replay-only: asking it to generate throws `locked`.

### Supporting hashes

- **Request hash** — intent + normalized shape + the *names* of context keys
  (values excluded). Stored with named slots (the match/replace test) and the
  key of the **negative cache**: a `cannotSatisfy` result is cached with a TTL
  (`config.unsatisfiableTtlMs`, default 5 min) so an impossible request isn't
  re-run until it expires.
- Every entry stores a **schema fingerprint**. After a schema change it no
  longer matches and the entry is treated as a miss and evicted — its cached
  DSL might reference columns that changed.

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
  warmup: 'full',          // 'full' (default) | 'lazy' | { mode: 'partial', fingerprints: [...] }
  onError: (err) => console.error(err),
});
await cache.init();        // runs L2/L1 init + warm-up

const engine = createQueryEngine({ adapter, cache });
```

Warm-up modes: `full` loads all of L2 into L1 at startup; `lazy` fills L1 on
demand; `partial` preloads only the listed fingerprints and lazy-fills the
rest. The tiered cache is single-instance: separate processes keep separate
L1s.

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
  itself plus `createQueryTools` for customizing the tool set.

The reference query agent (`vexQueryDslAgent`, id `vex.query`) is a Cortex
agent whose envelope payload is a `QuerySchema` query, with six tools:

| Tool | Input | Purpose |
|------|-------|---------|
| `getSchema` | `{ entities? }` | Read the schema (optionally a subset) |
| `getSampleRows` | `{ entity, limit? }` | See real rows (default 5) |
| `getDistinctValues` | `{ entity, field, limit? }` | Field cardinality (default 20) |
| `describeField` | `{ entity, field }` | type, nullable, cardinality, null count, min/max |
| `testQuery` | `{ dsl }` | Validate + compile + execute with synthetic params (LIMIT 5) |
| `cannotSatisfy` | `{ reason }` | Declare the request impossible (`createQueryDsl` aborts the run and throws `unsatisfiable`) |

Bounds: `stepCount(20)` + `outputRetries(3)` stop conditions on the agent. All
data-touching tools respect the scope policy. (If you build your own generator,
none of this applies — only the `Query` you return matters.)

`testQuery` executes drafts with **NULL synthetic params** — valid SQL against
a column of any type (Postgres infers from the column side), so a draft is
judged on executability, never on a guessed value's cast.

### `vexGuide()` — the exported agent-facing contract

Any agent that reads or embeds Vex endpoints should inject `vexGuide()` (a
string): the three request postures, fingerprint semantics, per-call context
values, reserved `sortBy`/`sortDir`, the response envelope, and discovery.
Attach it as a cortex tool `guide` or context producer. Apps never hand-write
their own Vex explanation — that is how docs drift.

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
  entities (fields, relations, row counts), the request body contract (the
  three fingerprint postures), the protection summary (`protection:
  "all"|"some"|"none"`, `locked`), the fingerprint overview (`[{ fingerprint,
  kind, protected, schemaFresh, intent, context, shape|effect, lastUsedAt }]`
  — `context` is the derived, typed input signature; `effect` summarizes a
  write), and the full DSL JSON Schema. A client or agent can read this to
  learn how to call the resource — and exactly what each fingerprint takes.
- **`POST`** → runs a query OR replays a write, one body shape. A
  `fingerprint` naming a `kind: 'mutation'` entry dispatches to the write
  pipeline (when `mutations` is configured); anything else is the read path
  (fingerprint replay, generation, or named slot); scope comes from
  `getScope`. Returns `{ status, body }` mapped to the HTTP response —
  unknown fingerprint → 404 `cache_miss`, protected mismatch → 409
  `fingerprint_protected`, locked → 403, a write with missing context → 400
  `missing_context` with the full derived signature in `details.expected`,
  other `VexError`s → 400 with `{ error, message, details }`, unexpected
  errors → 500.
- **`PATCH`** with `{ fingerprint, protected }` → flip the protection bit.
  **`DELETE`** with `{ fingerprint }` → evict (unprotected only). Fingerprints
  ride the body — names contain `/`.

Under the hood all of these call the framework-agnostic `handleDiscovery` /
`handleQuery` / `handleFingerprintPatch` / `handleFingerprintDelete` from
`handler.ts`, which you can use directly with any framework. A handler config
with `locked: true` makes the whole endpoint replay-only.

---

## Events

Pass `onEvent` to observe the pipeline. Every event is a discriminated union
member on `type`:

```typescript
import type { VexEvent } from '@niscorp/vex';

const onEvent = (e: VexEvent) => {
  switch (e.type) {
    case 'query.start':  /* intent, shape, fingerprint, entities */ break;
    case 'query.cache':  /* hit, fingerprint, replaced */ break;
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
| `missing_context` | A required context value was absent. Reads surface it softly via `meta.missingContext`; a WRITE hard-400s with the full derived signature in `details.expected` |
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
