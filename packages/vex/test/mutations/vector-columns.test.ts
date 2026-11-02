import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { executeWrites } from '../../src/mutations/engine.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const DDL = `
  CREATE EXTENSION vector;
  CREATE TABLE nodes (
    id text PRIMARY KEY,
    embedding vector(3)
  );
`;

const policy: ScopePolicy = { default: 'deny', entities: { nodes: { public: true } } };

const db = new PGlite({ extensions: { vector } });
const pool = createPglitePool(db);
let schema: DatabaseSchema;

beforeAll(async () => {
  await db.exec(DDL);
  schema = await createPostgresAdapter({ pool }).introspect();
});

afterAll(async () => {
  await db.close();
});

describe('insertEach into a vector column', () => {
  it('writes every item in one statement, from a JSON array of numbers or the pgvector text form', async () => {
    await executeWrites(
      pool,
      { op: 'insertEach', table: 'nodes', items: { $context: 'nodes' }, values: { id: { $item: 'id' }, embedding: { $item: 'embedding' } } },
      {
        context: {
          nodes: [
            { id: 'a', embedding: [0.1, 0.2, 0.3] },
            { id: 'b', embedding: '[0.4,0.5,0.6]' },
            { id: 'c', embedding: null },
          ],
        },
        scope: {},
        policy,
        schema,
      },
    );
    const rows = (await db.query<{ id: string; embedding: string | null }>('SELECT id, embedding::text AS embedding FROM nodes ORDER BY id')).rows;
    expect(rows).toEqual([
      { id: 'a', embedding: '[0.1,0.2,0.3]' },
      { id: 'b', embedding: '[0.4,0.5,0.6]' },
      { id: 'c', embedding: null },
    ]);
  });
});
