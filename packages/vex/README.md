# @niscorp/vex

Declarative query synthesis. Describe the data you want in plain English and the shape you want it in; Vex generates a constrained query DSL, compiles it to parameterized SQL, runs it, reshapes the result, and caches every generation under a **fingerprint** so replaying it costs zero LLM calls.

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

// Generate once — the intent + the shape drive the DSL and the mapping.
// No fingerprint given, so the engine mints one and returns it.
const first = await engine.execute({
  intent: 'a customer\'s orders, newest first',
  shape: [{ id: '', total: 0, createdAt: '' }],
  context: { customerId: 'cust-42' },
});
const fp = first.meta.cache.fingerprint; // 'fp_…' — the replayable identity

// Replay by fingerprint — same DSL + mapping, zero LLM, context varies per call.
const again = await engine.execute({ fingerprint: fp, context: { customerId: 'cust-99' } });
// again.result (array | object | scalar), again.meta.cache.hit === true
```

Generating needs an LLM-backed `generateDsl` hook — see
[DOCS.md](./DOCS.md#wiring-the-llm-agents). Without one, the engine still serves
any request that **replays a fingerprint** (a named slot or a seeded read), and
the `compile`/`test` APIs work fully offline.

## The production shape

Most apps use Vex in two moves, then leave one door open:

1. **Author the API as fingerprints.** Seed each read and write as a named
   cache entry (`orders/recent`, `tasks/setDone`) — generation happens once, at
   build time, and the fingerprint is the whole wire contract. The wire carries
   `{ fingerprint, context }` and nothing else.
2. **Lock the endpoint.** `locked: true` makes it replay-only: a seeded
   fingerprint replays with zero LLM; an unknown or changed one is refused
   (`locked`). The model cannot generate ad-hoc SQL against your data.

Then keep **one** unlocked endpoint (wired with `generateDsl`) for genuine
ad-hoc queries — an agent, an admin console — under its own scope policy. Built
surfaces are locked; exploration is open and scoped.

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
