import { describe, it, expect } from 'vitest';
import { compile, execute } from '@niscorp/prism';
import { PGlite } from '@electric-sql/pglite';
import type { SignalClient } from '@niscorp/cortex';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createShapeMapper } from '../../src/agent/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { createPostgresCache } from '../../src/cache/postgres.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleQuery } from '../../src/handler.js';
import type { CacheBackend } from '../../src/cache/cache.types.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopeValues } from '../../src/scope/scope.types.js';
import type { MapToShape } from '../../src/types.js';

const named: Query = { from: ['people'], fields: ['people.id', 'people.name'], sort: [{ field: 'people.id', dir: 'asc' }] };
const shape = [{ id: 0, name: '' }];
const called = (): never => {
  throw new Error('the model was called');
};
const noModel: SignalClient = { step: called, stepStream: called, count: called, describe: called };
// The mapping a model would write for rows that already have the shape, with no model.
const asTheyAre: MapToShape = async (rows, wanted) => {
  const config = { $ref: '$.result' };
  const ir = await compile(config);
  return { ir, config, transformed: execute(ir, { result: JSON.parse(JSON.stringify(Array.isArray(wanted) ? rows : (rows[0] ?? null))) }) };
};

const world = async (cacheOf: (db: PGlite) => Promise<CacheBackend> = async () => createMemoryCache(), mapToShape: MapToShape = asTheyAre) => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE people (id serial PRIMARY KEY, name text NOT NULL); INSERT INTO people (name) VALUES ('Ada'), ('Ben');`);
  const asked: { key: string; scope: ScopeValues | undefined }[] = [];
  const inner = await cacheOf(db);
  const cache: CacheBackend = {
    ...inner,
    get: async (key, scope) => {
      asked.push({ key, scope });
      return inner.get(key, scope);
    },
  };
  const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache, generateDsl: async () => named, mapToShape });
  await engine.introspect();
  return { engine, inner, asked };
};

const fingerprintOf = (meta: { cache: { fingerprint?: string } }): string => {
  const { fingerprint } = meta.cache;
  if (fingerprint === undefined) throw new Error('the reply names no fingerprint');
  return fingerprint;
};

describe('a query vex writes for a request', () => {
  it('hands the mapping the intent it was asked in', async () => {
    const intents: (string | undefined)[] = [];
    const { engine } = await world(undefined, async (rows, wanted, intent) => {
      intents.push(intent);
      return asTheyAre(rows, wanted, intent);
    });
    await engine.execute({ intent: 'everybody, by name', shape: [{ id: 0, name: '' }], context: {} });
    expect(intents).toEqual(['everybody, by name']);
  });

  it("maps a plain shape with vex's own mapper and no model call", async () => {
    const { engine } = await world(undefined, createShapeMapper(noModel));
    const written = await engine.execute({ intent: 'everybody, by name', shape, context: {} });
    expect(written.result).toEqual([{ id: 1, name: 'Ada' }, { id: 2, name: 'Ben' }]);
  });

  it('keeps the prism config its mapping was compiled from, beside the compiled form', async () => {
    const { engine, inner } = await world();
    const written = await engine.execute({ intent: 'everybody, by name', shape, context: {} });

    const entry = await inner.get(fingerprintOf(written.meta));
    expect(entry?.kind).toBe('ok');
    expect(entry !== undefined && entry.kind === 'ok' ? entry.mapping : undefined).toEqual({ $ref: '$.result' });
    expect(entry !== undefined && entry.kind === 'ok' ? entry.prismIr : undefined).toBeDefined();
  });

  it('keeps it in the table too, and reads it back', async () => {
    const { engine, inner } = await world(async (db) => {
      const table = createPostgresCache({ pool: createPglitePool(db) });
      await table.init();
      return table;
    });
    const written = await engine.execute({ intent: 'everybody, by name', shape, context: {} });

    const entry = await inner.get(fingerprintOf(written.meta));
    expect(entry !== undefined && entry.kind === 'ok' ? entry.mapping : undefined).toEqual({ $ref: '$.result' });
  });
});

describe('a replay asks its cache for the entry with the scope of whoever asks', () => {
  it('through the engine', async () => {
    const { engine, asked } = await world();
    const written = await engine.execute({ intent: 'everybody, by name', shape, context: {} });
    const fingerprint = fingerprintOf(written.meta);
    asked.length = 0;

    await engine.execute({ fingerprint, context: {} }, { scope: { userId: 'ada' } });

    expect(asked).toContainEqual({ key: fingerprint, scope: { userId: 'ada' } });
  });

  it('through the handler, which reads the entry before it runs it', async () => {
    const { engine, asked } = await world();
    const written = await engine.execute({ intent: 'everybody, by name', shape, context: {} });
    const fingerprint = fingerprintOf(written.meta);
    asked.length = 0;

    const answered = await handleQuery({ engine }, { fingerprint, context: {} }, { userId: 'ben' });

    expect(answered.status).toBe(200);
    expect(asked.filter((one) => one.key === fingerprint).map((one) => one.scope)).toEqual([{ userId: 'ben' }, { userId: 'ben' }]);
  });
});
