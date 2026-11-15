import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { executeWrites } from '../../src/mutations/engine.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// Both schemas have a `notes` table, and the connection's search_path reads `public`.
const DDL = `
  CREATE SCHEMA app;
  CREATE TABLE app.notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE public.notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
`;

const open: ScopePolicy = { default: 'allow', entities: {} };

const db = new PGlite();
const pool = createPglitePool(db);
let engine: QueryEngine;
let schema: DatabaseSchema;

beforeAll(async () => {
  await db.exec(DDL);
  const cache = createMemoryCache();
  await seedCache(cache, [{ fingerprint: 'notes', shape: [{ body: '' }], dsl: { from: ['notes'], fields: ['notes.body'] } }]);
  engine = createQueryEngine({ adapter: createPostgresAdapter({ pool, schema: 'app' }), cache });
  schema = await engine.introspect();
});

afterAll(async () => {
  engine.rows.stop();
  await db.close();
});

describe('an adapter given a schema', () => {
  it('reads the table a write wrote to', async () => {
    await executeWrites(pool, { op: 'insert', table: 'notes', values: { id: 'n1', body: 'written' } }, { context: {}, scope: {}, policy: open, schema });
    expect((await engine.execute({ fingerprint: 'notes', context: {} })).result).toEqual([{ body: 'written' }]);
  });
});
