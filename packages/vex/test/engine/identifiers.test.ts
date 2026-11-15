import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { executeWrites } from '../../src/mutations/engine.js';
import type { MutationDefinition } from '../../src/mutations/schema.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// A table named by a reserved word, one with capitals, and columns with capitals:
// each only reachable when the statement quotes it.
const DDL = `
  CREATE TABLE "order" (id TEXT PRIMARY KEY, "createdAt" TEXT NOT NULL UNIQUE, "userName" TEXT NOT NULL);
  CREATE TABLE "Line" (id TEXT PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "order" (id), "lineQty" INTEGER NOT NULL);
  INSERT INTO "order" VALUES ('o1', '2026-01-01', 'ada'), ('o2', '2026-02-01', 'bob');
  INSERT INTO "Line" VALUES ('l1', 'o1', 3);
`;

const open: ScopePolicy = { default: 'allow', entities: {} };

const db = new PGlite();
const pool = createPglitePool(db);
let engine: QueryEngine;
let schema: DatabaseSchema;

const replay = async (fingerprint: string): Promise<unknown> => (await engine.execute({ fingerprint, context: {} })).result;
const write = async (def: MutationDefinition, context: Record<string, unknown> = {}): Promise<unknown[]> =>
  (await executeWrites(pool, def, { context, scope: {}, policy: open, schema })).flatMap((w) => w.rows);

beforeAll(async () => {
  await db.exec(DDL);
  const cache = createMemoryCache();
  await seedCache(cache, [
    { fingerprint: 'orders', shape: [{}], dsl: { from: ['order'], fields: ['order.createdAt', 'order.userName'], sort: [{ field: 'order.createdAt', dir: 'asc' }] } },
    {
      fingerprint: 'orders/lines',
      shape: [{}],
      dsl: { from: ['order', 'Line'], fields: ['order.userName', 'Line.lineQty'], filter: { eq: ['Line.orderId', 'order.id'] } },
    },
    {
      fingerprint: 'orders/counted',
      shape: [{}],
      dsl: { from: ['order'], fields: ['order.userName'], aggregate: { n: { count: 'order.createdAt' } }, groupBy: ['order.userName'], sort: [{ field: 'order.userName', dir: 'asc' }] },
    },
    {
      fingerprint: 'orders/through-a-subquery',
      shape: [{}],
      dsl: {
        from: [{ as: 'sub', query: { from: ['order'], fields: [{ field: 'order.userName', as: 'userName' }] } }],
        fields: ['sub.userName'],
        sort: [{ field: 'sub.userName', dir: 'asc' }],
      },
    },
    {
      fingerprint: 'orders/with-a-line',
      shape: [{}],
      dsl: { from: ['order'], fields: ['order.userName'], filter: { exists: { from: ['Line'], filter: { eq: ['Line.orderId', 'order.id'] } } } },
    },
  ]);
  engine = createQueryEngine({ adapter: createPostgresAdapter({ pool }), cache });
  schema = await engine.introspect();
});

afterAll(async () => {
  engine.rows.stop();
  await db.close();
});

describe('a read names tables and columns as the database spells them', () => {
  it('reads a table named by a reserved word, and columns with capitals', async () => {
    expect(await replay('orders')).toEqual([
      { createdAt: '2026-01-01', userName: 'ada' },
      { createdAt: '2026-02-01', userName: 'bob' },
    ]);
  });

  it('joins a table with capitals in its name', async () => {
    expect(await replay('orders/lines')).toEqual([{ userName: 'ada', lineQty: 3 }]);
  });

  it('groups and counts by columns with capitals', async () => {
    expect(await replay('orders/counted')).toEqual([
      { userName: 'ada', n: 1 },
      { userName: 'bob', n: 1 },
    ]);
  });

  it('reads a subquery column with capitals from the outer query', async () => {
    expect(await replay('orders/through-a-subquery')).toEqual([{ userName: 'ada' }, { userName: 'bob' }]);
  });

  it('reads a table with capitals inside an exists', async () => {
    expect(await replay('orders/with-a-line')).toEqual([{ userName: 'ada' }]);
  });
});

describe('a write names tables and columns as the database spells them', () => {
  it('inserts, updates on conflict, and deletes', async () => {
    const inserted = await write({ op: 'insert', table: 'order', values: { id: 'o3', createdAt: '2026-03-01', userName: 'cy' } });
    expect(inserted).toEqual([{ id: 'o3', createdAt: '2026-03-01', userName: 'cy' }]);

    const upserted = await write({
      op: 'insert',
      table: 'order',
      values: { id: 'o4', createdAt: '2026-03-01', userName: 'dee' },
      onConflict: { target: ['createdAt'], set: { userName: 'dee' } },
    });
    expect(upserted).toEqual([{ id: 'o3', createdAt: '2026-03-01', userName: 'dee' }]);

    const updated = await write({ op: 'update', table: 'order', set: { createdAt: '2026-03-02' }, where: { eq: ['order.userName', 'dee'] } });
    expect(updated).toEqual([{ id: 'o3', createdAt: '2026-03-02', userName: 'dee' }]);

    const deleted = await write({ op: 'delete', table: 'order', where: { eq: ['order.createdAt', '2026-03-02'] } });
    expect(deleted).toEqual([{ id: 'o3', createdAt: '2026-03-02', userName: 'dee' }]);
  });

  it('inserts each item, with a value read by $lookup', async () => {
    const rows = await write(
      {
        op: 'insertEach',
        table: 'Line',
        items: { $context: 'lines' },
        values: {
          id: { $item: 'id' },
          orderId: { $lookup: { from: 'order', field: 'id', where: { eq: ['order.userName', 'bob'] } } },
          lineQty: { $item: 'qty' },
        },
      },
      { lines: [{ id: 'l2', qty: 5 }] },
    );
    expect(rows).toEqual([{ id: 'l2', orderId: 'o2', lineQty: 5 }]);
  });
});
