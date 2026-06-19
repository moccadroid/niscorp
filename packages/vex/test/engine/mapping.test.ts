import { describe, it, expect } from 'vitest';
import { compile } from '@niscorp/prism';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { computeShapeHash } from '../../src/cache/hash.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseAdapter, CompiledQuery, BoundParams, Row } from '../../src/adapters/adapter.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ResolvedQuery } from '../../src/engine/engine.types.js';
import type { Query } from '../../src/schemas/query.schema.js';

// Vex runs the cached Prism IR ONCE and returns its output verbatim — the
// mapping, not Vex, owns the output shape. The request shape picks the envelope:
// an ARRAY shape maps over the whole row set (`$.result` is the array), a
// non-array shape maps the single (first) row (`$.result` is that row, no
// `[0]`). These tests pin that contract: the engine no longer forces `Row[]`.

const TEST_SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'companies',
      table: 'companies',
      fields: [
        { name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'name', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'total', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'companies_pkey', fields: ['id'], unique: true, type: 'btree' }],
      rowCount: 2,
    },
  ],
};

const ROWS: Row[] = [
  { id: 'c1', name: 'Acme', total: 100 },
  { id: 'c2', name: 'Globex', total: 200 },
];

const DSL: Query = {
  from: ['companies'],
  fields: ['companies.id', 'companies.name', 'companies.total'],
};

const makeAdapter = (rows: Row[]): DatabaseAdapter => ({
  id: 'mock',
  introspect: async () => TEST_SCHEMA,
  compile: (_r: ResolvedQuery): CompiledQuery => ({
    sql: 'SELECT id, name, total FROM companies',
    paramSlots: [],
    contextContract: {},
  }),
  execute: async (_q: CompiledQuery, _p: BoundParams): Promise<Row[]> => rows,
  capabilities: {
    vectorSearch: false, fuzzyMatch: false, jsonFields: false, fullTextSearch: false,
    returningClause: false, cte: false, windowFunctions: false, statementTimeout: false,
  },
});

// Seed the cache with the DSL + a compiled mapping IR, keyed by shape, so
// execute() takes the cache-hit path (no LLM) and replays the mapping over the
// whole row set. No fingerprint/expiry → always fresh (see isEntryFresh).
const makeEngine = async (shape: unknown, mapping: unknown): Promise<QueryEngine> => {
  const engine = createQueryEngine({ adapter: makeAdapter(ROWS) });
  await engine.introspect();
  const prismIr = await compile(mapping);
  await engine.cache.set(computeShapeHash(shape), {
    kind: 'ok',
    dsl: DSL,
    prismIr,
    createdAt: Date.now(),
  });
  return engine;
};

describe('Whole-set Prism mapping', () => {
  it('returns an array when the mapping maps over $.result', async () => {
    const shape = [{ id: '', label: '' }];
    const engine = await makeEngine(shape, {
      $map: {
        over: { $ref: '$.result' },
        as: 'row',
        body: {
          id: { $get: { from: { $var: 'row' }, path: ['id'] } },
          label: { $get: { from: { $var: 'row' }, path: ['name'] } },
        },
      },
    });

    const res = await engine.execute({ shape, context: {} }, { cache: 'use' });

    expect(res.meta.cache.hit).toBe(true);
    expect(res.result).toEqual([
      { id: 'c1', label: 'Acme' },
      { id: 'c2', label: 'Globex' },
    ]);
  });

  it('returns a single object when the shape is an object (maps the first row)', async () => {
    // An object shape → Vex hands Prism the single (first) row, so the mapping
    // reads `$.result.field` — no `[0]`.
    const shape = { id: '', name: '' };
    const engine = await makeEngine(shape, {
      id: { $ref: '$.result.id' },
      name: { $ref: '$.result.name' },
    });

    const res = await engine.execute({ shape, context: {} }, { cache: 'use' });

    expect(res.meta.cache.hit).toBe(true);
    expect(Array.isArray(res.result)).toBe(false);
    expect(res.result).toEqual({ id: 'c1', name: 'Acme' });
  });

  it('a non-array shape maps the single row (scalar from a field)', async () => {
    const shape = 0;
    const engine = await makeEngine(shape, { $ref: '$.result.total' });

    const res = await engine.execute({ shape, context: {} }, { cache: 'use' });

    expect(res.result).toBe(100);
  });

  it('identity mapping hands back the whole rows array unchanged', async () => {
    const shape = [{ id: '', name: '', total: 0 }];
    const engine = await makeEngine(shape, { $ref: '$.result' });

    const res = await engine.execute({ shape, context: {} }, { cache: 'use' });

    expect(res.result).toEqual(ROWS);
  });
});
