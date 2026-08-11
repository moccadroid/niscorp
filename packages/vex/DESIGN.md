# Vex — Design Document

## Purpose

Intent-based data access. A caller describes *what* data they need and the
*shape* they want it in. Vex synthesizes a query, executes it, and reshapes the
result to match. Because it caches each generation under a fingerprint, replaying that
fingerprint costs zero LLM calls.

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
                       │  Cache write (by fingerprint)         │
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
  paths → table aliases + columns, FK-based join discovery between entity
  sources (a nullable FK resolves to a LEFT join so a null FK never drops the
  referencing row; subquery sources are not FK-joined — the compiler cross-joins them,
  and the outer query can reference their field/compute/aggregate outputs),
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

### Cache — mechanics

Identity is the **fingerprint** (see Cache v2 below). The supporting hashes:

- **Request hash** (`computeRequestHash`) hashes intent + normalized shape +
  *context key names* (not values). It identifies the *request* stored with a
  named slot (match → hit, differ → regenerate-and-replace), and keys the
  negative cache and single-flight de-duplication.
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
  (`createPostgresCache`, jsonb table, server-side TTL, `protected`/
  `last_used_at`/`request_hash` columns with idempotent ALTER migrations,
  validate-on-write and evict-on-read), and tiered (`createTieredCache`, L1 +
  L2 read-through/write-through with `full`/`lazy`/`partial` warm-up). Every
  backend implements the same `CacheBackend` contract; `init`/`entries` are
  optional capabilities used for warm-up and the discovery overview.
- **Validation** (`validateEntry`) guards every write and every promotion into
  memory, so a corrupt or schema-drifted row can never poison the cache.
- **GC** (`sweepCache`) evicts entries idle past `maxIdleMs`
  (`lastUsedAt ?? createdAt`), skipping protected ones. Hygiene, not necessity.

### Cache v2 — fingerprints

Agreed and implemented 2026-07-10; replaced shape-keyed caching everywhere
(engine, HTTP layer, and all consumers — relay, fable, mythos, showroom).

**Why v1 has to go.** Shape-hash identity collides: two different intents with
the same normalized shape share one slot, so the second silently returns the
first's data stamped `hit: true`. Entries are anonymous — no way to pin,
promote, iterate, or roll back a generation. And running a query writes the
cache as a side effect, so *testing* and *publishing* are the same physical
act: callers either bypass the cache and lose the artifact, or hit it and can
never change it.

**The model: one identity, `fingerprint`.**

- A request WITHOUT a fingerprint generates and caches; the server mints a
  fingerprint (`fp_…`) and returns it in `meta.cache.fingerprint`.
- A minted fingerprint is an **immutable pin** — embed it and replay the exact
  generation forever. Changing the query means proving again and embedding the
  new fingerprint. (git: a commit hash.)
- A caller-chosen fingerprint (any string) is a **mutable named slot** — the
  name is yours, its content follows your request. (git: a branch.)
- Intent NEVER keys anything: natural language is fake identity in both
  directions. It remains generator input + human metadata.

**Three request postures** — the body replaces every cache mode:

```jsonc
// 1. Explore: generate, cache, mint
{ "intent": "top 10 open deals by value…", "shape": [{ "id": "", "value_display": "" }] }
// → meta.cache: { "fingerprint": "fp_9k27ax", "hit": false }

// 2. Replay: fingerprint alone (+ context VALUES welcome) — never generates
{ "fingerprint": "fp_9k27ax", "context": { "sortBy": "deals.value" } }
// → meta.cache: { "fingerprint": "fp_9k27ax", "hit": true }; unknown fp → 404

// 3. Own a slot: fingerprint + request
{ "fingerprint": "deals/table", "intent": "…", "shape": [ … ] }
// stored request matches → hit; differs → regenerate + REPLACE the slot
// (meta.cache.replaced: true) — unless protected → 409
```

Request equality = intent string + normalized shape + context KEY NAMES
(`normalizeShape` survives for this comparison; context values are runtime
data and never identity — which is what makes replays parameterizable:
`sortBy`/search terms may vary per call against one cached DSL).

**Lifetime = usage.** Every replay stamps `lastUsedAt`; a GC sweep evicts
entries unused for N days. An embedded pin is touched on every mount and lives
forever by being used; an abandoned exploration ages out. There are NO
provisional/permanent tiers and NO promote API — the distinction is replaced
by the convention *alive = used*. (Entries are single-digit KB; the sweep is
hygiene, not necessity.)

**Protection: one stored bit, two writers, one knob.**

- `protected: true` on an entry means a differing request 409s instead of
  replacing. Written ONLY by (i) the seed path and (ii) an explicit `PATCH`
  (which is what "save/lock this view" calls). Runtime writes are never
  protected by default.
- One endpoint knob: `locked: true` = replay-only posture (no generation at
  all — the production stance; v1's `cache: 'only'` promoted from caller flag
  to endpoint config).
- No governance fields ever ride in the query body.

**The REST surface.** Vex is an API endpoint over REST and is designed as one.
Scoped mounts (`/api/deals/vex`) ride the existing `options.entities` filter —
scope constrains *generation* (smaller schema, no out-of-scope joins);
identity stays global.

- `POST /api/<scope>/vex` — execute (the three postures above). Errors:
  unknown fingerprint replay → 404 `cache_miss`; protected slot + differing
  request → 409 `fingerprint_protected`; locked endpoint asked to generate →
  403 `locked`.
- `GET /api/<scope>/vex` — self-description: `{ protection:
  "all"|"some"|"none", locked, fingerprints: [{ fingerprint, protected,
  schemaFresh, intent, lastUsedAt }] }` plus the schema/DSL/body docs. Doubles
  as agent-facing discovery: "does a named query already cover this?" is one
  call.
- `PATCH /…/vex` with `{ fingerprint, protected }` — flip the bit. `DELETE`
  with `{ fingerprint }` — evict (unprotected only). Fingerprints ride the
  body, not the path — names contain `/`.

**What dies with v1:**

- `CacheMode` (`use`/`refresh`/`bypass`/`only`), `ExecuteOptions.cache`, the
  `?cache=` query param — the request body says everything now.
- The shape hash as a cache key (and with it the entire collision class).
- The embed-VERBATIM requirement for generated screens: a pin has no wording
  to drift, and context may vary per replay — sorting and parameterized
  reloads become legal on cached queries again.

**Unchanged:** the negative cache (request-hash keyed, TTL'd), schema-
fingerprint freshness/eviction, backends and tiering, `validateEntry`.

**Where it landed:**

- Engine (`engine/runtime.ts`): `resolveFingerprint` — no fp → mint; fp alone
  → replay or `cache_miss`; fp + request → hit on matching request hash,
  regenerate-and-replace on mismatch (409 when protected). Fingerprint-only
  replays use the entry's STORED shape for the array-vs-single envelope.
  Replays touch `lastUsedAt`.
- Request schema: `fingerprint` in; `intent`/`shape` optional. Meta:
  `cache: { hit, fingerprint, replaced?, intent? }`.
- Backends: keys are fingerprint strings; entries carry `protected`,
  `lastUsedAt`, `requestHash`; `sweepCache` GC; postgres migrates in place.
- HTTP: `handleQuery` (no cache param), async `handleDiscovery` overview,
  `handleFingerprintPatch`/`handleFingerprintDelete`; express + hono adapters.
- Consumers: seeds re-keyed to protected names (`deals/list`, `todos/open`,
  …); every hand-authored read replays `{ fingerprint, context }`; relay's
  architect embeds `{ fingerprint: meta.cache.fingerprint, context }`; mythos'
  `/api/query` is `locked` (replay-only); showroom's demos own
  `vex-demo/<id>` slots (canned = seed + replay, live = delete + regenerate).

### Mutations (write pipeline)

Writes are first-class but deliberately NARROWER than reads. The asymmetry is
the design: a bad generated query shows wrong data, a bad generated write
destroys it — so mutations have **no generation path at all**. A mutation is
a dev-authored artifact that enters through the seed path, lives in the cache
as a `kind: 'mutation'` entry (the def in the same jsonb slot a query's DSL
uses), and is invoked by fingerprint. The def never travels: an inline
`{ mutation }` body is not a request shape, and the wire is ONE shape for
both kinds — `POST { fingerprint, context }`, dispatched by the entry's kind.
Replay-only holds under every posture (`locked` only ever governed query
generation); the query engine refuses a mutation fingerprint explicitly.

The pipeline: validate (closed grammar — `$scope` unauthorable, update/delete
require a WHERE) → desugar (upsert → insert/update by key presence) →
require context (a write never executes with holes; the `missing_context`
error carries the FULL derived signature) → scope (the same `ScopePolicy`
reads use: `set` writes identity on insert and update, `match` pins rows) → column
check against the introspected schema → compile (through the read
pipeline's own `compileFilter`/`compileFieldOrValue`/`resolveParams`, so
values bind as SQL parameters exactly like reads) → execute. Batches run in
one transaction; the client is structural (`MutationClient` — PGlite, a pg
wrapper, a test double), so the core imports no driver.

**Derived context signatures** close the discoverability loop for both
kinds: a `$context` ref sits at a position whose column the schema types, so
"what do I pass this fingerprint" is computed from the stored def — never
authored, never stale. Discovery lists every entry with kind, intent, the
typed context contract, and shape (reads) or effect (`{op, table, columns}`,
writes). An authoring lint (`lintMutation`) refuses un-keyed update/delete
defs at seed time.

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

  mutations/
    schema.ts                    MutationSchema (closed grammar), MutationDefinitionSchema
    engine.ts                    executeMutation — desugar/scope/validate/compile/execute
    signature.ts                 collectMutationContext, collectQueryContext, mutationEffect, lintMutation
    index.ts                     Barrel

  cache/
    cache.types.ts               CacheBackend, CacheEntry (ok | mutation | unsatisfiable)
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

3. **Fingerprint identity, minted or named.** The output shape still
   determines the DSL and the mapping — but the cache *key* is a fingerprint,
   not the shape. A first request mints one (`fp_…`); a caller may instead own
   a named slot. Shape-hashing collided (two intents, one shape, one slot) and
   left every entry anonymous; a fingerprint makes a generation an addressable,
   replayable artifact — pin it, replay it, roll it back. (See *Cache v2*.)

4. **Scope injected server-side, after RESOLUTION.** If the model could see
   scope filters it could be talked out of them. Binding them to `$scope`
   values after the DSL is fixed makes them unforgeable.

   Scope answers two questions and they run at different stages, which is the
   correction to an earlier version that ran both at once:

   - **May this caller touch this table?** — `checkScope`, over entity names,
     before resolution. Needs no schema and no aliases.
   - **Where does the row rule go?** — `scopeResolved`, after resolution,
     because the answer depends on HOW the table is reached.

   That second stage exists because merging row rules into the DSL's `filter`
   compiles them to WHERE, and **a WHERE predicate on a left-joined table is a
   LEFT JOIN demoted to an INNER one.** A driving row whose optional FK is null
   gets null-padded columns, `null = $tenant` is null rather than true, and the
   row disappears. No error, no warning, a shorter list — and invisible until
   the data actually contains a null FK, which in one consumer took months.
   The resolver had already gone to the trouble of inferring `left` for exactly
   this reason; the scope layer was undoing it two steps later.

   Row rules for left-joined tables now go in that join's `ON` clause. The
   boundary is unchanged — another tenant's row still cannot contribute
   columns — it simply no longer annihilates the row that had none.

   A consequence worth having on its own: scope writes nothing into the
   authored `Query`. The document integrations ship over the wire carries no
   engine-trusted field, so there is no key to strip at intake and no forgery
   surface to remember.

10. **`exists` shadows SQL rather than inventing a vocabulary.** Correlated
    subqueries were the one thing the filter grammar could not express, so
    "issues nobody was sent to" and "rooms nobody is in" became two round trips
    each — a read returning a flat array of ids, then a `notIn` against it.
    That is fine at three dozen rows, wrong at three thousand, and racy in
    between.

    `{ exists: { from, filter } }` is the same `{ from, filter }` a query
    already is, and nothing more: no fields, no sort, no limit. EXISTS asks
    whether a row is there, so anything shaping output would be noise — and
    refusing it is what keeps this an operator rather than an invitation to
    nest arbitrary SQL. The correlation needs no new syntax at all, because a
    dotted string on either side of a comparison is already a field path:

    ```json
    { "exists": { "from": ["tasks"],
                  "filter": { "eq": ["tasks.issue_id", "issues.id"] } } }
    ```

    `not` composes for NOT EXISTS. Whoever knows SQL writes this on the first
    try, which was the entire design constraint.

    Two implementation notes that are load-bearing. It compiles **inline**,
    into the parent's own parameter counter — the other subquery path compiles
    independently and renumbers afterwards, which is how two parameterised
    subqueries came to collide on `$1`; there is nothing to renumber if nothing
    was numbered apart. And its inner aliases come from the **shared** alias
    counter, so an `exists` over the same table as the outer query cannot take
    the same alias and silently correlate a table with itself.

    Scope recurses into it. Access-checking the inner table is not enough: an
    EXISTS returns a boolean, but a boolean about somebody else's rows is still
    an answer about somebody else's rows, and an uncorrelated `exists` over a
    scoped table would otherwise report whether ANY tenant had one.

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

9. **Writes are replay-only, one wire shape with reads.** Mutations are
   dev-authored cache entries (`kind: 'mutation'`) invoked by fingerprint;
   the def never travels and no generation path exists. The client-facing
   API is uniformly `{ fingerprint, context }` — the entry's kind picks the
   pipeline. Context signatures are DERIVED from the stored def (typed from
   the schema by position), so the input contract can't drift.

---

## Deferred

- Dynamic mutation generation — icebox, on purpose. If it ever returns, it
  feeds the existing pipeline (author → validate → seed) behind an effect
  contract and an approval step; nothing shipped today gets replaced.
- Mutation transactions with cross-statement refs (`$returned.id` — the
  create-parent-then-children case). Batches are atomic today but cannot
  reference earlier statements' results.
- MySQL / SQLite adapters — the interface is ready; implementation on demand.
- Multi-level field paths — addable in the resolver without DSL changes.
- ~~Intent-aware positive caching~~ — superseded: collisions did bite, and the
  answer is identity, not intent-matching. See **Cache v2 — fingerprints**.
- Cross-process cache coherence for the tiered backend (an L1 TTL refresh).
- Adapter-owned vector serialization — the pgvector `[...]` literal is currently
  formed in the generic binding step; a second adapter would move it behind the
  adapter.

## Reach is the caller's, not the table's

A `ScopePolicy` fuses two questions: which phases an entity has, and what a
granted phase does. The second used to be answered per TABLE — one `match` rule
per entity, applied to every caller that held any grant on it.

That is right until two callers need the same grant at different distances. "The
desk reads every booking; a member reads their own" cannot be said with one rule
per table, and the workaround is always the same: a SECOND TABLE carrying the
tighter rule, kept level with the first by a trigger. One fact in two places is
a drift bug waiting for the first ordering nobody thought about.

So a table may declare NAMED rule sets, and `createScopePolicy` takes the
caller's profile:

    bookings: { default:  { read: [tenant] },
                personal: { read: [tenant, own] } }

    createScopePolicy(grants, behaviors)             // studio-wide
    createScopePolicy(grants, behaviors, 'personal') // + their own rows

The profile is chosen ONCE per caller rather than per grant, because "acts for
themselves" is a property of the caller and not of each thing they read — and
saying it once is one place to get it wrong instead of eight. A table declaring
no variant under a profile falls back to its `default`, which is what keeps
shared reads (a timetable everyone sees the same way) free of per-profile
entries.

It fails closed in the direction that matters. An unknown profile denies
everything rather than falling back: a mistyped name that quietly meant "the
default" would widen a caller to every row of every table they hold a grant on,
which is the one failure mode a policy layer may not have. A table that declares
named variants and no `default` likewise refuses an unprofiled caller instead of
guessing that "no rule" is safe.

AND A CALLER IS NOT ONE ROLE. Reach belongs to a role, and people hold several —
the instructor who trains at the studio they teach at is the ordinary case, not
the edge. So the unit of compilation is the ROLE: one policy each, merged
(`mergeScopePolicies`), broadest rule set winning per entity and phase. A
principal may do anything any of their roles permits.

That merge has a consequence worth stating plainly: for somebody holding both, a
staff role's studio-wide reach WINS over a member role's personal one on the
tables they share. Correct for the roster they are paid to read, wrong for their
own membership card.

SO REACH IS SAID TWICE, and by two different parties. The CALLER carries a floor
— how far this principal may see, from their role. The ENTRY may carry a ceiling
— how far this READ may see, whoever asks (`reach`). "Their own card" is a
property of the question, not of whoever happens to be asking it, and an app that
could only say it about people was an app that got it wrong for anybody holding
two roles.

The two compose in one direction only: an entry's reach recompiles the caller's
OWN grants under a different profile, so it narrows rows and never widens verbs.
A principal without the verb is refused either way. And a declared reach that
cannot be compiled refuses the read rather than falling back — the fallback would
be an answer with too much in it, and nothing would say so.
