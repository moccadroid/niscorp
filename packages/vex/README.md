# @niscorp/vex

Declarative query synthesis. Describe the data you want in plain English and the shape you want it in; Vex generates a constrained query DSL, compiles it to parameterized SQL, runs it, reshapes the result, and caches everything **by shape** so repeated patterns cost zero LLM calls.

The LLM never writes SQL. It fills in a validated JSON DSL; a deterministic pipeline does the rest. Server-side scope policies enforce access control the model can't see or bypass.

## Install

```bash
pnpm add @niscorp/vex zod
# Postgres adapter (optional peer):
pnpm add pg
# Only if you wire the bundled LLM agents:
pnpm add @niscorp/cortex @niscorp/signal @niscorp/prism
```

## Quick Example

```typescript
import pg from 'pg';
import { createQueryEngine, createPostgresAdapter } from '@niscorp/vex';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = createPostgresAdapter({ pool });
const engine = createQueryEngine({ adapter });

await engine.introspect(); // discover tables, columns, relations, indexes

// Deterministic path — no LLM. Hand-write the DSL, get rows back.
const response = await engine.execute(
  {
    shape: [{ id: '', total: 0, createdAt: '' }],
    context: { customerId: 'cust-42' },
  },
  { /* options */ },
);
// response.result, response.meta.cache, response.meta.timing
```

To go from natural language (`intent`) to DSL, wire an LLM-backed `generateDsl`
hook into the engine — see [DOCS.md](./DOCS.md#wiring-the-llm-agents). Without
it, the engine still serves any request whose shape is already cached, and the
`compile`/`test` APIs work fully offline.

## Documentation

- **[DOCS.md](./DOCS.md)** — Full usage guide: configuration, DSL reference, scope, caching, framework adapters, error handling, local dev.
- **[DESIGN.md](./DESIGN.md)** — Architecture, the pipeline, and the reasoning behind each decision.

## API

```typescript
const engine = createQueryEngine(config);

engine.introspect();              // Promise<DatabaseSchema> — load + cache schema
engine.execute(request, options); // Promise<QueryResponse> — the full pipeline
engine.compile(dsl, scope?);      // CompiledQuery — DSL → SQL, no LLM, no execution
engine.test(dsl, scope?);         // Promise<TestResult> — compile + run with synthetic params (LIMIT 5)
engine.getDslSchema();            // object — the DSL as JSON Schema (draft-7)
engine.getSchema();               // DatabaseSchema | undefined — last introspected schema
engine.cache;                     // CacheBackend — the live cache
```

## What's in the box

| Area | Provided |
|------|----------|
| Database adapters | PostgreSQL (`createPostgresAdapter`) — pluggable `DatabaseAdapter` interface for others |
| Cache backends | In-memory, Postgres (durable), tiered L1/L2 with warm-up |
| Framework adapters | Hono (`@niscorp/vex/hono`), Express (`@niscorp/vex/express`) — discovery + query endpoints |
| LLM integration | `generateDsl` / `mapToShape` hooks; reference agents built on `@niscorp/cortex` |
| Safety | Server-side scope policies, query analyzer (cartesian/nesting/index checks), parameterized SQL only |

## License

MIT
