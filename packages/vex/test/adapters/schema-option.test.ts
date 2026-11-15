import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import type { QueryEngine } from '../../src/types.js';

// Both schemas have the same tables; only `app` has a tag.
const DDL = `
  CREATE SCHEMA app;
  CREATE TABLE app.notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE app.tags (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES app.notes (id), label TEXT NOT NULL);
  INSERT INTO app.notes VALUES ('a1', 'from app');
  INSERT INTO app.tags VALUES ('t1', 'a1', 'kept');
  CREATE TABLE public.notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE public.tags (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES public.notes (id), label TEXT NOT NULL);
  INSERT INTO public.notes VALUES ('p1', 'from public');
`;

const db = new PGlite();
let engine: QueryEngine;

const replay = async (fingerprint: string): Promise<unknown> => (await engine.execute({ fingerprint, context: {} })).result;

beforeAll(async () => {
  await db.exec(DDL);
  const cache = createMemoryCache();
  await seedCache(cache, [
    { fingerprint: 'notes', shape: [{ body: '' }], dsl: { from: ['notes'], fields: ['notes.body'] } },
    { fingerprint: 'notes/tagged', shape: [{ body: '', label: '' }], dsl: { from: ['notes', 'tags'], fields: ['notes.body', 'tags.label'] } },
    {
      fingerprint: 'notes/with-a-tag',
      shape: [{ body: '' }],
      dsl: { from: ['notes'], fields: ['notes.body'], filter: { exists: { from: ['tags'], filter: { eq: ['tags.note_id', 'notes.id'] } } } },
    },
  ]);
  engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db), schema: 'app' }), cache });
  await engine.introspect();
});

afterAll(async () => {
  engine.rows.stop();
  await db.close();
});

describe('an adapter given a schema reads the tables of that schema', () => {
  it('reads a table from it', async () => {
    expect(await replay('notes')).toEqual([{ body: 'from app' }]);
  });

  it('joins a second table from it', async () => {
    expect(await replay('notes/tagged')).toEqual([{ body: 'from app', label: 'kept' }]);
  });

  it('reads the table inside an exists from it', async () => {
    expect(await replay('notes/with-a-tag')).toEqual([{ body: 'from app' }]);
  });
});
