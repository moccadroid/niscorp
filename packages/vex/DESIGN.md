# Vex — Design Document

## Purpose

Intent-based data access. A caller describes *what* data they need and the
*shape* they want it in. Vex synthesizes a query, executes it, and reshapes the
result to match. Because it caches by shape, repeated access patterns cost zero
LLM calls after the first.

**One sentence:** ask for data in English, get it in any shape, from any database.

The thesis: most applications have a small, stable set of data-access patterns.
Each pattern has a consistent output shape. Once the DSL (and any result
mapping) is generated for a shape, it is reused for every later request with
that shape — the LLM cost amortizes to zero, and the hot path is pure compile +
execute.

---

## Core principles

1. **The DSL is the source of truth.** The LLM never emits SQL. It fills a
   constrained JSON DSL that is Zod-validated before anything else touches it.
   Scope, discovery, analysis, and compilation all operate on the DSL or on a
   value derived from it.
2. **Deterministic core, injected intelligence.** The engine itself contains no
   LLM code. Natural-language→DSL and rows→shape are two optional function
   hooks (`generateDsl`, `mapToShape`). With them, Vex answers free-form
   requests. Without them, it is a deterministic DSL compiler + executor + cache
   that still serves any already-cached shape. Cortex/Signal/Prism are optional
   peer dependencies, not hard ones.
3. **Shape-only caching.** The positive cache key is a hash of the request's
   *shape* with all values replaced by type tokens. Two requests with the same
   structure but different values share a cache entry. Intent is deliberately
   excluded from this key.
4. **Scope is server-side and LLM-invisible.** Access control is injected into
   the DSL *after* generation, as ordinary filter clauses bound to server
   `$scope` values. The model cannot see or forge them, so prompt injection
   cannot bypass them.
5. **One-level field paths.** Always `entity.field`, never
   `entity.relation.field`. Every entity appears explicitly in `from`. This
   keeps the resolver simple and entity discovery a pure string walk.
6. **Postgres first, adapter interface from day one.** SQL generation is the
   only database-specific step. It lives entirely behind the `DatabaseAdapter`
   interface so other backends can follow without changing the core.
7. **Schemas teach the model.** Every DSL schema field carries a Zod
   `.describe()`. The JSON Schema generated from it — not prose — is what the
   query agent reads to learn the DSL.

---

## Architecture

```
                       ┌──────────────────────────────────────┐
   QueryRequest        │  { intent?, shape, context }          │
   + ExecuteOptions    │  options: { scope?, cache?, entities?} │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  Validate (Zod) + hash                │
                       │  shapeHash (positive key)             │
                       │  requestHash (negative key / single-  │
                       │  flight)                              │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  Cache read                           │
                       │  positive HIT → cached DSL (+ Prism IR)│
                       │  negative HIT → throw unsatisfiable   │
                       │  miss + mode 'only' → throw cache_miss │
                       └────────────────┬─────────────────────┘
                            miss ↓                 ↑ hit (skip generation)
                       ┌──────────────────────────────────────┐
                       │  generateDsl hook (LLM, optional)     │
                       │  single-flighted; negative-caches a   │
                       │  "cannot satisfy" result              │
                       └────────────────┬─────────────────────┘
                                        ↓
   ── deterministic pipeline (runPipeline) ───────────────────────────
                       ┌──────────────────────────────────────┐
                       │  clamp limit → discover entities →    │
                       │  apply scope → resolve → analyze →    │
                       │  adapter.compile → CompiledQuery      │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  Missing-context check                │
                       │  → return empty result + meta.        │
                       │    missingContext (valid response)    │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  Bind params (context/scope/embed) →  │
                       │  adapter.execute → raw rows           │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  Map to shape (optional)              │
                       │  cached Prism IR → apply; else        │
                       │  mapToShape hook (LLM) → IR + rows    │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  Cache write (positive, shape-keyed)  │
                       │  DSL + Prism IR + schema fingerprint  │
                       └────────────────┬─────────────────────┘
                                        ↓
                       ┌──────────────────────────────────────┐
                       │  { result, meta: { cache, context,    │
                       │    timing, warnings? } }              │
                       └──────────────────────────────────────┘
```

On a cache hit, generation and mapping are skipped: the pipeline re-runs
deterministically against the cached DSL and applies the cached Prism IR. No
LLM calls. That re-run (resolve → analyze → compile → bind → execute) is what
makes scope and context values current on every request, even cached ones.

---

## Subsystems

### The DSL

A constrained JSON structure (`schemas/`) that can only express safe, valid
queries. Top level (`QuerySchema`):

- `from` — array of entity names or `{ as, query }` subqueries (min 1).
- `fields` — array of `entity.field` paths (min 1; **required** — no `SELECT *`).
- `filter` — a recursive `FilterSchema` union.
- `compute` — record of `alias → ComputeExpression` (arithmetic, `concat`,
  `coalesce`, `case`).
- `aggregate` — record of `alias → AggregateExpression` (`count`/`sum`/`avg`/
  `min`/`max`).
- `groupBy`, `sort`, `limit`, `distinct`.

Filter operators: `eq`/`neq`/`gt`/`gte`/`lt`/`lte`, `in`/`notIn`, `like`/
`ilike`, `isNull`/`isNotNull`, `and`/`or`/`not`, plus `semantic` (vector
similarity) and `fuzzy` (string distance). Values are literals, `{ $context }`
(caller-provided) or `{ $scope }` (server-injected).

Two refinements over a naive design, both for the model's benefit: there is no
`offset` (cursor pagination via a `gt` filter is safer and cacheable) and no
`between` (it is sugar for `and(gte, lte)`). Fewer operators means a smaller
JSON Schema and better model adherence.

### Scope

Two pure functions over the DSL:

- `discoverEntities(dsl)` walks every place an entity name can appear — `from`,
  field paths, filter paths (recursively through `and`/`or`/`not`), compute and
  aggregate references, `groupBy`, `sort`, and into subqueries — and returns the
  set of referenced entities. No schema needed; pure string extraction.
- `applyScope(dsl, entities, policy)` looks up each discovered entity in the
  policy and produces a new DSL. `public` rules pass through; `deny` (or no rule
  under a `default: 'deny'` policy) throws `VexScopeError`; filter rules become
  `{ eq|neq|in: ["entity.field", { $scope: "source" }] }` clauses AND-merged
  into the existing filter. It recurses into subqueries.

Scope runs after generation and before resolution. The resolver, analyzer, and
compiler never know scope exists — they just process a DSL that happens to carry
extra filter clauses.

### Engine (deterministic pipeline)

- **resolver** (`resolve`) turns the scoped DSL into a `ResolvedQuery`: field
  paths → table aliases + columns, FK-based join discovery between sources,
  subquery recursion.
- **analyzer** (`analyze`) validates the resolved query and returns
  `{ warnings, errors }`. Errors halt the pipeline; warnings ride along in the
  response. Checks: nesting depth vs `maxNestingDepth`; cartesian products
  (multiple entity sources with no connecting join); unindexed filter columns
  (warn or reject); aggregates without `groupBy` (warn); vector field without an
  HNSW/IVFFlat index for semantic search (warn).
- **executor** (`executeQuery`, `buildContextContract`, `findMissingContext`)
  binds parameters and calls `adapter.execute`. Binding resolves each
  `ParamSlot` from context (`context`), scope (`scope`), or by embedding text
  (`semantic`). `findMissingContext` reports which required keys the caller
  omitted so the runtime can return a valid-but-empty response instead of
  failing.

### Adapters

`DatabaseAdapter` is the whole database boundary: `introspect`, `compile`
(`ResolvedQuery → CompiledQuery`), `execute`, and a `capabilities` flag set.
Compilation is adapter-internal — there is no shared compiler in `engine/`; each
adapter owns its full SQL dialect (the Postgres adapter has its own
filter/compute/aggregate SQL generation under `adapters/postgres/`).

A `CompiledQuery` is `{ sql, paramSlots, contextContract }`. The ordered
`paramSlots` array drives positional binding (`$1`, `$2`, …); each slot knows
its `kind` (context/scope/semantic), `type`, and (for semantic) `dimensions`.
The text→vector `embed` function is an engine-level injected provider
(`createQueryEngine({ embed })`), used by the executor during binding for
`semantic` slots — the adapter only emits the vector-distance SQL, never embeds.

The Postgres adapter advertises vector search, JSON fields, full-text, CTEs,
window functions, RETURNING, and statement timeout; it coerces numeric column
strings (int8/numeric/float) back to JS numbers on the way out.

### Cache

- **Shape hash** (`computeShapeHash`) normalizes the shape — sort keys, collapse
  arrays to their first-element shape, replace scalars with type tokens — then
  SHA-256s it. This is the positive-cache key.
- **Request hash** (`computeRequestHash`) hashes intent + normalized shape +
  *context key names* (not values). It keys the negative cache and single-flight
  de-duplication, where intent matters.
- **Schema fingerprint** (`computeSchemaFingerprint`) is a stable hash of the
  structural schema (names, types, nullability, PKs, relations, indexes —
  excluding volatile rowCount and cosmetic fields). It is stored on each entry;
  a mismatch means the cached DSL may reference changed columns, so the entry is
  treated as a miss and evicted. Stable across restarts so warm-up entries
  aren't wrongly discarded.
- **Entry kinds.** A discriminated union: `ok` (DSL + optional Prism IR) and
  `unsatisfiable` (a TTL'd negative result — a request the agent declared
  impossible, so it isn't re-run until the TTL lapses or the schema changes).
- **Backends.** In-memory (`createMemoryCache`), durable Postgres
  (`createPostgresCache`, jsonb table, server-side TTL, validate-on-write and
  evict-on-read), and tiered (`createTieredCache`, L1 + L2 read-through/
  write-through with `full`/`lazy`/`partial` warm-up). Every backend implements
  the same `CacheBackend` contract; `init`/`entries` are optional capabilities
  used for warm-up and a future management UI.
- **Validation** (`validateEntry`) guards every write and every promotion into
  memory, so a corrupt or schema-drifted row can never poison the cache.

### LLM integration (decoupled)

The engine takes two optional hooks:

- `generateDsl(request, schema) → Query` — natural language + shape → DSL.
- `mapToShape(rows, shape) → { ir, transformed }` — raw rows → requested shape,
  returning a compiled Prism IR that is cached for reuse.

This is the seam that keeps the core deterministic. Vex ships a reference
implementation of both, built on `@niscorp/cortex` and `@niscorp/prism` and
exported from the `@niscorp/vex/agent` subpath — `createQueryDsl` (fills
`generateDsl`) and `createShapeMapper` (fills `mapToShape`):

- The **query agent** (`vexQueryDslAgent`, id `vex.query`) is a structured-output
  Cortex agent over `QuerySchema` with six tools — `getSchema`, `getSampleRows`,
  `getDistinctValues`, `describeField`, `testQuery`, `cannotSatisfy` — and two
  rules: a tool-call limiter (nudge at 8, abort at 10) and an unsatisfiable
  abort. Context producers inject the live schema and the DSL JSON Schema so the
  static instructions stay stable. All data-touching tools respect scope.
  `createQueryDsl` wraps it into the `generateDsl` hook.
- The **mapping agent** is Prism's exported `mappingAgent`; `createShapeMapper`
  wraps each raw row as `{ result: row }`, runs the agent once to get a transform
  config, compiles it to IR, and applies the IR row-by-row.

> The reference agents are a separate concern from the deterministic core: they
> live behind the `@niscorp/vex/agent` subpath, so `@niscorp/cortex`,
> `@niscorp/signal`, and `@niscorp/prism` are pulled in only when you import it.
> The engine itself depends on none of them — provide your own
> `generateDsl`/`mapToShape`, or use the reference factories.

### HTTP layer (optional)

Vex is a library; it does not own a server. But it ships two thin framework
adapters and a framework-agnostic handler so a resource can be exposed with a
few lines:

- `handler.ts` — `handleDiscovery` returns a self-describing JSON document
  (entities, fields, relations, the request contract, and the DSL JSON Schema);
  `handleQuery` parses a body, runs `engine.execute`, and maps `VexError`s to
  HTTP status codes.
- `@niscorp/vex/hono` and `@niscorp/vex/express` wrap that handler: `GET`
  returns discovery, `POST` runs a query, scope is resolved per-request via a
  `getScope` callback, and the `cache` query param selects the cache mode.

### Events

An optional `onEvent` handler receives a typed `VexEvent` stream across the
pipeline — `query.start`, `query.cache`, `query.dsl`, `query.sql`,
`query.rows`, `query.mapped`, `query.done`, `query.error`, plus `llm.request`/
`llm.response` for callers that wrap their LLM client. This is how the dev
server renders per-stage timing and a full LLM transcript log.

---

## File structure

```
src/
  index.ts                       Public API barrel
  types.ts                       QueryEngine, QueryEngineConfig, ExecuteOptions, hook types
  errors.ts                      VexError (code + details)
  events.ts                      VexEvent union, VexEventHandler
  handler.ts                     Framework-agnostic discovery + query handlers

  schemas/
    query.schema.ts              QuerySchema (top-level DSL) + Source, SortEntry
    filter.schema.ts             FilterSchema (recursive union)
    compute.schema.ts            ComputeExpressionSchema
    aggregate.schema.ts          AggregateExpressionSchema
    value.schema.ts              FieldOrValue, ContextRef ($context), ScopeRef ($scope)
    database.schema.ts           DatabaseSchema, EntitySchema, FieldSchema, ...
    request.schema.ts            QueryRequestSchema, QueryResponse, error codes
    index.ts                     Barrel

  scope/
    discover.ts                  discoverEntities(dsl)
    apply.ts                     applyScope(dsl, entities, policy), VexScopeError
    scope.types.ts               ScopePolicy, ScopeEntityRule, ScopeFilterRule

  engine/
    runtime.ts                   createQueryEngine — orchestration + cache + single-flight
    resolver.ts                  resolve(dsl, schema) → ResolvedQuery
    analyzer.ts                  analyze(resolved, config) → { warnings, errors }
    executor.ts                  executeQuery, buildContextContract, findMissingContext
    engine.types.ts             ResolvedQuery and friends, AnalysisConfig, TestResult

  adapters/
    adapter.types.ts             DatabaseAdapter, CompiledQuery, ParamSlot, capabilities
    postgres/
      postgres.adapter.ts        createPostgresAdapter
      introspect.ts              schema discovery from pg_catalog
      compile.ts                 ResolvedQuery → parameterized SQL
      operators.ts               per-operator SQL generation
    hono/index.ts                vex() Hono app (@niscorp/vex/hono)
    express/index.ts             vex() Express handler (@niscorp/vex/express)
    index.ts                     adapter barrel

  cache/
    cache.types.ts               CacheBackend, CacheEntry (ok | unsatisfiable), CacheMode
    hash.ts                      computeShapeHash, computeRequestHash, computeSchemaFingerprint
    memory.ts                    createMemoryCache (L1)
    postgres.ts                  createPostgresCache (L2, durable)
    tiered.ts                    createTieredCache (L1 + L2, warm-up)
    validate.ts                  validateEntry
    util.ts                      isEntryFresh, fireAndForget
    index.ts                     Barrel

  agent/                         Reference Cortex agents (exported via ./agent)
    query.agent.ts               defineAgent: vexQueryDslAgent (vex.query → Query)
    tools.ts                     the six query tools
    rules.ts                     tool-limit + unsatisfiable rules
    producers.ts                 schema + DSL-spec context producers
    index.ts                     createQueryDsl, createShapeMapper, vexQueryDslAgent

  utils/
    context.ts                   buildValidationContext, resolveParams

scripts/                         Dev-only: docker, seed, dev server, fixtures
```

---

## Dependencies

| Package | Relationship | Purpose |
|---------|--------------|---------|
| `zod` | peer (required) | Schema validation + JSON Schema generation |
| `pg` | peer (optional) | Postgres adapter and Postgres cache backend |
| `hono` | peer (optional) | Hono framework adapter |
| `express` | peer (optional) | Express framework adapter |
| `@niscorp/cortex` | peer (optional) | Reference query agent (`defineAgent`/`defineTool`/`defineRule`, standalone runtime) |
| `@niscorp/signal` | peer (optional) | LLM calls + embeddings, via Cortex |
| `@niscorp/prism` | peer (optional) | Result mapping (`mappingAgent`, IR compile/execute) |

Only `zod` is mandatory. Everything else is pulled in only by the path you use.

---

## Key design decisions

1. **Constrained DSL, not text-to-SQL.** Security (the model can't emit
   injection through a validated JSON union), cacheability (a structure hashes
   more reliably than free text), and safety (the analyzer rejects cartesian
   products and over-deep nesting *before* SQL exists).

2. **The LLM is injected, not embedded.** Making `generateDsl`/`mapToShape`
   plain hooks keeps the engine deterministic and testable without a model,
   lets the heavy Cortex/Signal/Prism stack stay optional, and lets a consumer
   swap in their own generator. The bundled Cortex agents are a reference, not a
   requirement.

3. **Shape-based caching, intent excluded from the key.** The output shape is
   what determines the DSL and the mapping; the same shape reuses both. Intent
   is captured for inspection and for the *negative* key (where it does matter),
   but two requests that want the same shape should share work.

4. **Scope injected server-side, after generation.** If the model could see
   scope filters it could be talked out of them. Injecting them as ordinary
   filter clauses bound to `$scope` values, after the DSL is fixed, makes them
   unforgeable.

5. **Negative caching with a TTL.** An "impossible" request is expensive to
   re-discover every time, so a `cannotSatisfy` result is cached — but TTL'd and
   fingerprinted, because a schema change can make yesterday's impossible
   request possible.

6. **Single-flight on the default path.** A burst of identical cache misses
   collapses to one generation; the rest await it. `refresh`/`bypass` opt out,
   since they explicitly mean "don't share cache state."

7. **Adapters own compilation.** The DSL and agent loop are database-agnostic;
   only SQL generation is not. Keeping the entire compile step inside the
   adapter means a new backend is a self-contained unit and the core never grows
   dialect knowledge.

8. **A discovery endpoint, not just a query endpoint.** A self-describing
   resource (`GET` → entities + contract + DSL JSON Schema) lets a client — or
   another agent — learn how to query it without out-of-band documentation.

---

## Deferred

- MySQL / SQLite adapters — the interface is ready; implementation on demand.
- Multi-level field paths — addable in the resolver without DSL changes.
- Intent-aware positive caching — shape design guidelines first; developer-
  assigned keys if collisions bite.
- Cross-process cache coherence for the tiered backend (an L1 TTL refresh).
- Adapter-owned vector serialization — the pgvector `[...]` literal is currently
  formed in the generic binding step; a second adapter would move it behind the
  adapter.
