import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import type { QueryEngine } from '../../src/types.js';

const DDL = `
  CREATE EXTENSION vector;
  CREATE TABLE notes (id TEXT PRIMARY KEY, embedding vector(2) NOT NULL);
  INSERT INTO notes VALUES ('about-cats', '[1,0]'), ('about-dogs', '[0,1]');
`;

const VECTORS: Record<string, number[]> = { cats: [1, 0], dogs: [0, 1] };
const embed = async (text: string): Promise<number[]> => VECTORS[text] ?? [0, 0];

const db = new PGlite({ extensions: { vector } });
let engine: QueryEngine;

beforeAll(async () => {
  await db.exec(DDL);
  const cache = createMemoryCache();
  await seedCache(cache, [
    {
      fingerprint: 'notes/near-my-interest',
      shape: [{ id: '' }],
      dsl: { from: ['notes'], fields: ['notes.id'], filter: { semantic: { field: 'notes.embedding', query: { $scope: 'interest' }, minScore: 0.9 } } },
    },
  ]);
  engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache, embed });
  await engine.introspect();
});

afterAll(async () => {
  engine.rows.stop();
  await db.close();
});

describe('a semantic filter that embeds a $scope value', () => {
  it('embeds the value the server supplied, not one the caller sends', async () => {
    const response = await engine.execute({ fingerprint: 'notes/near-my-interest', context: { interest: 'dogs' } }, { scope: { interest: 'cats' } });
    expect(response.result).toEqual([{ id: 'about-cats' }]);
  });

  it('needs nothing from the caller', async () => {
    const response = await engine.execute({ fingerprint: 'notes/near-my-interest', context: {} }, { scope: { interest: 'cats' } });
    expect(response.result).toEqual([{ id: 'about-cats' }]);
  });

  it('is refused when the server supplied no value', async () => {
    await expect(engine.execute({ fingerprint: 'notes/near-my-interest', context: { interest: 'dogs' } })).rejects.toMatchObject({ code: 'missing_scope' });
  });
});
