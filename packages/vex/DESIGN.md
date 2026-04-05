# Design Document: `@niscorp/vex` — Declarative Query Synthesis

## Purpose

Intent-based data access. Users describe what data they need. The system figures out the query, executes it, transforms the result to the requested shape. Caches by shape so repeated patterns cost zero LLM calls.

**One sentence:** Ask for data in English, get it in any shape, from any database.

---

## What We Learned

The original query synthesis prototype (*rnd.dqs*) was the strongest proof-of-concept in the archive. The core pattern - LLM generates a constrained DSL, DSL compiles deterministically to SQL, scope policies enforce security - is genuinely novel and should be the centerpiece of this package.

### What worked brilliantly
- **LLM → DSL → SQL** (LLM never touches SQL, every output validated)
- **Shape-based caching** (same shape = cache hit, different values don't bust cache)
- **Scope policies** (server-side, LLM-invisible access control)
- **Two-agent architecture** (query agent for DSL, mapping agent for result transformation)
- **Prism integration** for result shaping (compile IR once, apply to every execution)
- **Database introspection** (auto-discover schema, relations, indexes)
- **Agent tools** (getSchema, getSampleRows, getDistinctValues, testQuery)

### What needs redesign
- **PostgreSQL-only.** The DSL and agent loop assumed Postgres. The compilation step needs to be pluggable.
- **Introspection was one-shot.** Schema discovered at startup, no change detection.
- **Scope model was too simple.** Only field-equals-value. Need expressions, column-level control, computed scopes.
- **No query plan explanation.** Hard to debug why the agent chose a particular DSL.
- **Mapping agent was separate from query pipeline.** Should be integrated so caching covers both.
- **Semantic search was OpenAI-only.** Embedding should use the Signal package (`@niscorp/signal`).

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                  User Request                      │
│  { intent?, shape, context }                       │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Shape Cache Check                     │
│  Compute shape hash → check cache                  │
│  HIT: skip to Execution with cached DSL + IR       │
│  MISS: continue to Agent                           │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Query Agent (LLM)                     │
│  Iterative tool-use loop (max N iterations)        │
│  Tools: schema, samples, distinct values, test     │
│  Output: validated DSL query                       │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Scope Application                     │
│  Apply server-side access policies to DSL          │
│  Inject scope filters, restrict entities           │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Analysis                              │
│  Validate nesting depth, detect cartesian products │
│  Warn on unindexed filters, reject ambiguous joins │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Compilation                           │
│  DSL → parameterized SQL (via database adapter)    │
│  Extract parameter map and context requirements    │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Execution                             │
│  Bind parameters, execute query, get raw rows      │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Mapping (optional)                    │
│  If shape ≠ raw rows: Mapping Agent generates IR   │
│  Prism engine applies IR to raw rows           │
│  Cache IR alongside DSL                            │
└──────────────────┬────────────────────────────────┘
                   ↓
┌───────────────────────────────────────────────────┐
│              Response                              │
│  { result, meta: { cache, context, timing } }      │
└───────────────────────────────────────────────────┘
```

---

## Public API

```typescript
// ═══════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════

export const createQueryEngine: (config: QueryEngineConfig) => QueryEngine;

// ═══════════════════════════════════════════════════════════
// Core Interface
// ═══════════════════════════════════════════════════════════

type QueryEngine = {
  // Discover database schema
  introspect: () => Promise<DatabaseSchema>;

  // Execute a natural-language-to-data request
  execute: (request: QueryRequest, options?: ExecuteOptions) => Promise<QueryResponse>;

  // Compile a known DSL query (no LLM, for programmatic use)
  compile: (dsl: Query, scope?: ScopeValues) => CompiledQuery;

  // Export documentation for LLM consumption
  getDocumentation: () => string;

  // Export DSL JSON Schema
  getDslSchema: () => object;

  // Get current database schema
  getSchema: () => DatabaseSchema | undefined;
};

// ═══════════════════════════════════════════════════════════
// Schemas & Types
// ═══════════════════════════════════════════════════════════

export { QuerySchema, FilterSchema, ComputeSchema, AggregateSchema };
export type { Query, QueryRequest, QueryResponse, DatabaseSchema, ScopePolicy };
```

---

## Configuration

```typescript
type QueryEngineConfig = {
  // Database adapter (required)
  adapter: DatabaseAdapter;

  // LLM client for agent intelligence (from @niscorp/signal)
  llm: SignalClient;

  // Prism engine for result shaping (from Prism package (`@niscorp/prism`))
  transform?: PrismEngine;

  // Scope policy
  scope?: ScopePolicy;

  // Cache backend (default: in-memory Map)
  cache?: CacheBackend;

  // Configuration
  config?: {
    maxNestingDepth?: number;         // Default: 3
    defaultLimit?: number;            // Default: 100
    maxLimit?: number;                // Default: 1000
    maxAgentIterations?: number;      // Default: 10
    rejectCartesianProducts?: boolean; // Default: true
    warnUnindexedFilters?: boolean;    // Default: true
    entities?: string[];              // Whitelist (undefined = all)
  };
};
```

---

## Database Adapter System

The biggest change from the original: the database layer is pluggable.

### Adapter Interface

```typescript
type DatabaseAdapter = {
  id: string;                         // 'postgres', 'mysql', 'sqlite'

  // Schema discovery
  introspect: (options?: IntrospectOptions) => Promise<DatabaseSchema>;

  // Compile DSL to native query
  compile: (resolved: ResolvedQuery, params: ParameterMap) => NativeQuery;

  // Execute native query
  execute: (query: NativeQuery, params: unknown[]) => Promise<Row[]>;

  // Capabilities
  capabilities: AdapterCapabilities;
};

type AdapterCapabilities = {
  vectorSearch: boolean;              // pgvector, etc.
  fuzzyMatch: boolean;                // fuzzystrmatch, etc.
  jsonFields: boolean;                // JSON/JSONB column support
  fullTextSearch: boolean;            // tsvector, FULLTEXT, etc.
  returningClause: boolean;          // INSERT ... RETURNING
  cte: boolean;                       // WITH ... AS
  windowFunctions: boolean;
};

type NativeQuery = {
  sql: string;
  params: unknown[];
};
```

### Built-in Adapters

```typescript
// adapters/postgres.ts
export const postgres = (pool: PgPool): DatabaseAdapter => { ... };

// adapters/mysql.ts (future)
export const mysql = (connection: MysqlConnection): DatabaseAdapter => { ... };

// adapters/sqlite.ts (future)
export const sqlite = (db: SqliteDatabase): DatabaseAdapter => { ... };
```

Ship with PostgreSQL first. MySQL and SQLite come later. The adapter interface is the contract.

### Database Schema

```typescript
type DatabaseSchema = {
  entities: EntitySchema[];
};

type EntitySchema = {
  name: string;                       // Table name
  description?: string;               // From table comment or manual annotation
  fields: FieldSchema[];
  relations: RelationSchema[];
  indexes: IndexSchema[];
};

type FieldSchema = {
  name: string;
  type: string;                       // Native type (varchar, integer, etc.)
  normalizedType: NormalizedType;      // Canonical type (string, number, boolean, date, json, vector)
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: unknown;
  description?: string;
  vectorDimensions?: number;          // For vector fields
};

type RelationSchema = {
  type: 'hasOne' | 'hasMany' | 'belongsTo';
  entity: string;                     // Related entity
  localField: string;
  foreignField: string;
};

type IndexSchema = {
  name: string;
  fields: string[];
  unique: boolean;
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'ivfflat' | 'hnsw' | 'other';
};
```

---

## The DSL (Query Language)

The DSL is what the LLM agent generates. It's a constrained JSON structure that can only express safe, valid queries.

### Query Schema

```typescript
const QuerySchema = z.object({
  from: z.array(z.string()).min(1)
    .describe('Entity names to query from'),

  fields: z.array(z.union([
    z.string(),                        // Simple field: "entity.field"
    FieldAliasSchema,                  // Aliased: { field: "entity.field", as: "name" }
    ComputeSchema,                     // Computed: { compute: ..., as: "name" }
    AggregateSchema,                   // Aggregate: { aggregate: "sum", field: "...", as: "total" }
  ])).optional()
    .describe('Fields to select. Omit for all fields.'),

  filter: FilterSchema.optional()
    .describe('Filter conditions'),

  sort: z.array(SortSchema).optional()
    .describe('Sort order'),

  limit: z.number().int().positive().optional()
    .describe('Maximum rows to return'),

  offset: z.number().int().nonnegative().optional()
    .describe('Rows to skip'),

  distinct: z.boolean().optional()
    .describe('Return distinct rows only'),

  groupBy: z.array(z.string()).optional()
    .describe('Group by fields (required when using aggregates)'),
}).strict();
```

### Filter Operators

```typescript
// Comparison
{ eq: [fieldOrValue, fieldOrValue] }
{ neq: [fieldOrValue, fieldOrValue] }
{ gt: [fieldOrValue, fieldOrValue] }
{ gte: [fieldOrValue, fieldOrValue] }
{ lt: [fieldOrValue, fieldOrValue] }
{ lte: [fieldOrValue, fieldOrValue] }

// Collection
{ in: [field, [value, value, ...]] }
{ notIn: [field, [value, value, ...]] }

// String
{ like: [field, pattern] }
{ ilike: [field, pattern] }

// Null
{ isNull: field }
{ isNotNull: field }

// Range
{ between: [field, low, high] }

// Logic
{ and: [filter, filter, ...] }
{ or: [filter, filter, ...] }
{ not: filter }

// Semantic (vector similarity)
{ semantic: { field: "entity.embedding", query: { $context: "searchTerm" }, minScore?: number } }

// Fuzzy string
{ fuzzy: { field: "entity.name", query: { $context: "searchTerm" }, maxDistance?: number } }
```

### Values

```typescript
// Literal
42
"hello"
true
null

// Context reference (runtime value provided by caller)
{ $context: "userId" }

// Scope reference (server-injected, LLM-invisible)
{ $scope: "accountId" }
```

### Compute Expressions

```typescript
{ compute: { op: "add", args: ["entity.price", "entity.tax"] }, as: "total" }
{ compute: { op: "coalesce", args: ["entity.nickname", "entity.name"] }, as: "displayName" }
{ compute: { op: "case", when: [...], else: value }, as: "category" }
```

### Aggregates

```typescript
{ aggregate: "count", field: "*", as: "total" }
{ aggregate: "sum", field: "order.amount", as: "revenue" }
{ aggregate: "avg", field: "review.score", as: "avgScore" }
{ aggregate: "min", field: "product.price", as: "cheapest" }
{ aggregate: "max", field: "product.price", as: "priciest" }
```

---

## Query Agent

The query agent is an iterative LLM loop that generates DSL from natural language intent + shape description.

### Agent Tools

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `getSchema` | View database schema | `{ entity?: string }` | Entity/field/relation info |
| `getSampleRows` | See actual data | `{ entity: string, limit?: number }` | Sample rows |
| `getDistinctValues` | Understand field cardinality | `{ field: "entity.field", limit?: number }` | Distinct values |
| `describeField` | Get field statistics | `{ field: "entity.field" }` | Type, nulls, min/max, cardinality |
| `testQuery` | Try a DSL query | `{ query: Query }` | Validation result + sample rows (max 5) |

All tools respect scope policies. `getSampleRows` and `testQuery` return only scope-filtered data.

### Agent Loop

```
1. System prompt: DSL spec, available entities, rules
2. User prompt: intent + target shape + context keys
3. LLM responds (may call tools or produce DSL)
4. If tool call → execute tool, append result, go to 3
5. If DSL produced → validate with Zod
6. If valid → return DSL
7. If invalid → send validation errors back to LLM, go to 3
8. If max iterations reached → return error
```

### System Prompt Construction

The system prompt includes:
- Full DSL specification (from JSON Schema generation)
- Available entities and their fields (from introspection)
- Relations between entities
- Available filter operators
- Rules (no SQL, use only these entities, respect field types)
- Examples of well-formed DSL queries

This is generated once per introspection cycle and cached.

---

## Scope System

Server-side access control that is never exposed to the LLM agent.

### Scope Policy

```typescript
type ScopePolicy = {
  default: 'allow' | 'deny';          // What happens for entities without explicit rules
  entities: Record<string, ScopeEntityRule>;
};

type ScopeEntityRule =
  | { public: true }                   // No filtering needed
  | { deny: true }                     // Entity completely inaccessible
  | ScopeFilterRule
  | ScopeFilterRule[];                 // Multiple rules (AND)

type ScopeFilterRule = {
  field: string;                       // Entity field to filter on
  source: string;                      // Scope value key
  op?: 'eq' | 'in' | 'neq';          // Default: 'eq'
};
```

### Scope Application

After the LLM generates DSL, scope filters are injected:

```typescript
// Policy: { entities: { post: { field: "accountId", source: "accountId" } } }
// Scope values: { accountId: "acc-123" }

// DSL before scope:
{ from: ["post"], fields: ["post.title"], filter: { eq: ["post.status", "published"] } }

// DSL after scope:
{ from: ["post"], fields: ["post.title"], filter: {
  and: [
    { eq: ["post.status", "published"] },
    { eq: ["post.accountId", { $scope: "accountId" }] }  // INJECTED
  ]
}}
```

The LLM never sees scope filters. They're injected after DSL generation, before compilation.

### Scope Validation

If a query references an entity that requires scope but no scope value is provided, the execution fails with a clear error:

```typescript
{ error: "missing_scope", message: "Entity 'post' requires scope 'accountId' but it was not provided" }
```

---

## Shape-Based Caching

### Cache Key

The cache key is a hash of the **shape structure** - the shape itself with all literal values normalized. This means:

```typescript
// These two requests produce THE SAME cache key:
{ shape: { users: [{ name: "", age: 0 }] }, context: { search: "alice" } }
{ shape: { users: [{ name: "", age: 0 }] }, context: { search: "bob" } }

// This one produces a DIFFERENT cache key:
{ shape: { users: [{ name: "", email: "" }] }, context: { search: "alice" } }
```

Same shape = same DSL + same IR. Only the runtime parameter values change.

### Cached State

```typescript
type CacheEntry = {
  dsl: Query;                          // The generated DSL
  transformIr?: CompiledIr;            // The compiled Prism IR (if mapping was needed)
  createdAt: number;
  hitCount: number;
};
```

### Cache Modes

| Mode | Behavior |
|------|----------|
| `use` (default) | Use cache if available, generate if not |
| `refresh` | Regenerate DSL and mapping, replace cache |
| `bypass` | Don't read or write cache |
| `only` | Only use cache, fail if miss |

---

## Resolution & Compilation Pipeline

Between DSL and SQL, three steps happen:

### 1. Resolution

Converts DSL field paths to actual database columns with proper aliasing and joins:

```typescript
// Input: "post.title", "post.author.name"
// Output: p1.title, u1.name (with JOIN users u1 ON p1.author_id = u1.id)
```

Auto-joins via foreign key relationships. Generates table aliases (`p1`, `u1`, etc.).

### 2. Analysis

Validates the resolved query:
- **Nesting depth** - Rejects if subqueries exceed maxNestingDepth
- **Cartesian products** - Errors if multiple sources with no join path
- **Unindexed filters** - Warns (or errors) if filtering on non-indexed columns
- **Ambiguous joins** - Rejects if multiple FK paths between two entities

Returns `{ warnings: string[], errors: string[] }`.

### 3. Compilation

Transforms resolved query to native SQL via the database adapter:

```typescript
type CompiledQuery = {
  native: NativeQuery;                 // { sql, params }
  paramMap: Map<string, number>;       // Context key → param index
  contextContract: ContextParam[];     // Required context values
};

type ContextParam = {
  key: string;
  type: 'literal' | 'semantic' | 'scope';
  required: boolean;
};
```

---

## Request / Response Contract

### Request

```typescript
type QueryRequest = {
  intent?: string;                     // Natural language (optional but recommended)
  shape: unknown;                      // Target response structure (JSON example)
  context: Record<string, unknown>;    // Runtime values for filters
};
```

Strictly validated. Extra keys rejected. `context` is visible to the LLM agent. Scope values are separate (passed via ExecuteOptions).

### Response

```typescript
type QueryResponse = {
  result: unknown;                     // Transformed to requested shape
  meta: {
    cache: { hit: boolean };
    context: Record<string, ContextMeta>;
    timing?: {
      agentMs?: number;               // LLM query generation time
      mappingMs?: number;             // LLM mapping generation time
      executionMs: number;            // SQL execution time
      transformMs?: number;           // Prism transformation time
    };
  };
};
```

### Errors

```typescript
type QueryError = {
  error: string;                       // Error code
  message: string;                     // Human-readable
  details?: {
    suggestion?: string;
    validationIssues?: Array<{ path: string; message: string }>;
  };
};
```

Error codes: `invalid_request`, `invalid_dsl`, `missing_scope`, `missing_context`, `execution_error`, `agent_failed`, `cache_miss` (when mode is `only`).

---

## Result Transformation

When the target shape differs from raw query rows, a mapping step transforms the result.

### When mapping is needed

```typescript
// Raw rows: [{ id: 1, first_name: "Alice", last_name: "Smith", email: "alice@..." }]
// Target shape: { users: [{ fullName: "", email: "" }] }
// Mapping needed: rename fields, nest into { users: [...] }
```

### Mapping Agent

A second LLM agent generates a transformation config (using the Prism package (`@niscorp/prism`)'s DSL):

1. Receives: sample result row, target shape, field descriptions
2. Generates: transformation config
3. Config is validated and compiled to IR
4. IR is cached alongside DSL

On subsequent cache hits, the IR is reused directly - no LLM call.

---

## File Structure

```
src/
├── index.ts                          # Public API
├── types.ts                          # Core types
├── schemas/
│   ├── index.ts                      # Barrel
│   ├── query.ts                      # QuerySchema
│   ├── filter.ts                     # FilterSchema (15+ operators)
│   ├── compute.ts                    # ComputeSchema
│   ├── aggregate.ts                  # AggregateSchema
│   ├── value.ts                      # ValueSchema ($context, $scope, literals)
│   ├── database.ts                   # DatabaseSchema, EntitySchema
│   └── request.ts                    # RequestSchema, ResponseSchema
├── engine/
│   ├── runtime.ts                    # High-level orchestration (execute flow)
│   ├── resolver.ts                   # DSL paths → column refs + joins
│   ├── analyzer.ts                   # Validation (cartesian, nesting, indexes)
│   ├── compiler.ts                   # Resolved query → adapter.compile()
│   └── executor.ts                   # Parameter binding + adapter.execute()
├── agent/
│   ├── query-agent.ts                # Query generation agent loop
│   ├── mapping-agent.ts              # Result transformation agent loop
│   ├── tools.ts                      # Agent tools (getSchema, testQuery, etc.)
│   └── prompts.ts                    # System/user prompt builders
├── scope/
│   ├── apply.ts                      # Apply scope policy to DSL
│   └── types.ts                      # ScopePolicy, ScopeEntityRule
├── cache/
│   ├── memory.ts                     # In-memory Map cache
│   ├── hash.ts                       # Shape hash computation
│   └── types.ts                      # CacheBackend interface
├── adapters/
│   ├── types.ts                      # DatabaseAdapter interface
│   ├── postgres.ts                   # PostgreSQL adapter
│   └── (future: mysql.ts, sqlite.ts)
├── documentation/
│   ├── generate.ts                   # Generate LLM documentation
│   └── json-schema.ts               # DSL JSON Schema export
└── utils/
    ├── context.ts                    # Context contract handling
    └── path.ts                       # Field path utilities
```

---

## Dependencies

- Transform package (peer) - Result transformation engine
- Signal package (`@niscorp/signal`) (peer) - Agent intelligence and embeddings
- `zod` (peer, ^4.0.0) - Schema validation
- `zod-to-json-schema` - JSON Schema generation

Database adapter dependencies are per-adapter:
- `pg` (peer, optional) - PostgreSQL adapter

---

## Key Design Decisions

1. **Why database adapters instead of PostgreSQL-only?** The DSL and agent loop are database-agnostic. Only SQL generation is database-specific. Adapters let us support MySQL, SQLite, even non-SQL backends (REST API adapter?) without changing the core.

2. **Why two agents (query + mapping) instead of one?** Separation of concerns. The query agent understands database schemas and SQL semantics. The mapping agent understands data transformation. They use different tools, different prompts, different expertise. Also: they cache independently.

3. **Why scope is server-only?** Security. If the LLM can see scope filters, it can be prompt-injected into ignoring them. Server-side injection after DSL generation is unforgeable.

4. **Why shape-based caching?** The insight: most applications have a small number of data access patterns. Each pattern has a consistent shape. Once the DSL and IR are generated for a shape, they can be reused for every request with that shape. The LLM cost amortizes to zero.

5. **Why not text-to-SQL?** Three reasons: (a) Security - LLM can't produce injection attacks through a constrained DSL. (b) Cacheability - DSL is structural, SQL is textual; structural caching is more reliable. (c) Safety - the analyzer can reject bad DSL (cartesian products, etc.) before it becomes SQL.

6. **Why is the Prism package (`@niscorp/prism`) a peer dependency?** Not everyone needs result transformation. If you're happy with raw rows, you can skip it. The query engine works without it - you just get raw query results instead of shaped results.
