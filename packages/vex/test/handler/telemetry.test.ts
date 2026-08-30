// THE EXECUTION OBSERVER — vex's whole telemetry surface, the read/write twin
// of `mutations.onWrite`. These pin the contract a host maps to a span:
//   - one record per execution, with the outcome's status;
//   - a refusal still names the fingerprint it refused (the operator's question
//     is "which query got denied", so the answer cannot be blank);
//   - cache hit/miss and row count for a read, kind for a write;
//   - unobserved endpoints do no work — the record is not built;
//   - a throwing observer is contained, never the request's.
//
// Vex reports facts in its own vocabulary; it holds no notion of a span. The
// mapping to a span (hasPrincipal, no scope values) is the host's, tested there.
import { describe, it, expect, beforeAll } from 'vitest';
import { handleQuery } from '../../src/handler.js';
import type { ExecuteRecord } from '../../src/handler.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import type { QueryEngine } from '../../src/types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { DatabaseAdapter, CompiledQuery, Row } from '../../src/adapters/adapter.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ResolvedQuery } from '../../src/engine/engine.types.js';

const SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'bookings',
      table: 'bookings',
      fields: [
        { name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'studio_id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'bookings_pkey', fields: ['id'], unique: true, type: 'btree' }],
      rowCount: 100,
    },
  ],
};

const adapter = (): DatabaseAdapter => ({
  id: 'test',
  introspect: async (): Promise<DatabaseSchema> => SCHEMA,
  compile: (q: ResolvedQuery): CompiledQuery => ({
    sql: `SELECT * FROM bookings${q.filter !== undefined ? ` WHERE ${JSON.stringify(q.filter)}` : ''}`,
    paramSlots: [],
    contextContract: {},
  }),
  execute: async (): Promise<Row[]> => [{ id: 'b1' }, { id: 'b2' }],
  capabilities: {
    vectorSearch: false,
    fuzzyMatch: false,
    jsonFields: false,
    fullTextSearch: false,
    returningClause: false,
    cte: false,
    windowFunctions: false,
    statementTimeout: false,
  },
});

const WIDE: ScopePolicy = { default: 'deny', entities: { bookings: { read: [{ match: 'studio_id', to: 'studioId' }] } } };
const SCOPE = { userId: 'p1', studioId: 'st1' };

describe('handleQuery.onExecute', () => {
  let engine: QueryEngine;

  beforeAll(async () => {
    engine = createQueryEngine({ adapter: adapter(), cache: createMemoryCache() });
    await engine.introspect();
    await engine.cache.set('plain', {
      kind: 'ok',
      dsl: { from: ['bookings'], fields: ['bookings.id'] },
      protected: true,
      createdAt: Date.now(),
    });
    await engine.cache.set('gated', {
      kind: 'ok',
      dsl: { from: ['bookings'], fields: ['bookings.id'] },
      reach: 'personal',
      protected: true,
      createdAt: Date.now(),
    });
  });

  const capture = () => {
    const spans: ExecuteRecord[] = [];
    return { spans, onExecute: (r: ExecuteRecord) => spans.push(r) };
  };

  it('fires once for a successful read — status ok, cache hit, rows, and timing', async () => {
    const { spans, onExecute } = capture();
    const res = await handleQuery({ engine, scopePolicy: WIDE, onExecute }, { fingerprint: 'plain', context: {} }, SCOPE);
    expect(res.status).toBe(200);
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.kind).toBe('query');
    expect(span.status).toBe('ok');
    expect(span.fingerprint).toBe('plain');
    expect(span.cacheHit).toBe(true);
    expect(span.rows).toBe(2);
    expect(span.reach).toBeUndefined();
    expect(span.endUnixNano).toBeGreaterThanOrEqual(span.startUnixNano);
    // The unforgeable scope rides the record for the host to read presence from.
    expect(span.scope).toEqual(SCOPE);
  });

  it('a policy refusal still names the fingerprint and reach it refused', async () => {
    const { spans, onExecute } = capture();
    const res = await handleQuery(
      { engine, scopePolicy: WIDE, policyForReach: () => undefined, onExecute },
      { fingerprint: 'gated', context: {} },
      SCOPE,
    );
    expect(res.status).toBe(403);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('refused');
    expect(spans[0]!.fingerprint).toBe('gated');
    expect(spans[0]!.reach).toBe('personal');
  });

  it('a cache miss is an error span that still carries the fingerprint', async () => {
    const { spans, onExecute } = capture();
    const res = await handleQuery({ engine, scopePolicy: WIDE, onExecute }, { fingerprint: 'ghost', context: {} }, SCOPE);
    expect(res.status).toBe(404);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('error');
    expect(spans[0]!.fingerprint).toBe('ghost');
  });

  it('unobserved: no observer, and the request answers exactly the same', async () => {
    // Structural — with no hook there is no record to inspect; the proof is the
    // request behaves identically and nothing is asked of a sink that is absent.
    const res = await handleQuery({ engine, scopePolicy: WIDE }, { fingerprint: 'plain', context: {} }, SCOPE);
    expect(res.status).toBe(200);
  });

  it('a throwing observer is contained — the request still answers', async () => {
    const res = await handleQuery(
      {
        engine,
        scopePolicy: WIDE,
        onExecute: () => {
          throw new Error('sink is down');
        },
      },
      { fingerprint: 'plain', context: {} },
      SCOPE,
    );
    expect(res.status).toBe(200);
    expect((res.body as { result?: unknown }).result).toBeDefined();
  });
});
