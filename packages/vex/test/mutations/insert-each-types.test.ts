import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { executeWrites } from '../../src/mutations/engine.js';
import type { MutationDefinition } from '../../src/mutations/schema.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const DDL = `
  SET TimeZone = 'Europe/Vienna';
  CREATE SCHEMA ext;
  CREATE EXTENSION vector SCHEMA ext;
  CREATE TYPE slot_status AS ENUM ('open', 'full');
  CREATE DOMAIN capacity AS integer NOT NULL DEFAULT 1;
  CREATE TABLE slots (
    id text PRIMARY KEY,
    starts_at time,
    status slot_status,
    host inet,
    length interval,
    tags text[],
    meta jsonb,
    embedding ext.vector(3),
    at timestamp,
    seats integer,
    places capacity
  );
`;

const policy: ScopePolicy = { default: 'deny', entities: { slots: { public: true } } };

const db = new PGlite({ extensions: { vector } });
const pool = createPglitePool(db);
let schema: DatabaseSchema;

const write = (def: MutationDefinition, context: Record<string, unknown>) => executeWrites(pool, def, { context, scope: {}, policy, schema });
const insertEach = (values: Record<string, { $item: string }>, rows: unknown[]) =>
  write({ op: 'insertEach', table: 'slots', items: { $context: 'rows' }, values }, { rows });

beforeAll(async () => {
  await db.exec(DDL);
  schema = await createPostgresAdapter({ pool }).introspect();
});

afterAll(async () => {
  await db.close();
});

describe("insertEach converts each item by its column's own type", () => {
  it('writes time, enum, inet, interval, array and jsonb columns, and a vector whose extension lives in another schema', async () => {
    await insertEach(
      {
        id: { $item: 'id' },
        starts_at: { $item: 'startsAt' },
        status: { $item: 'status' },
        host: { $item: 'host' },
        length: { $item: 'length' },
        tags: { $item: 'tags' },
        meta: { $item: 'meta' },
        embedding: { $item: 'embedding' },
      },
      [{ id: 'a', startsAt: '18:00', status: 'open', host: '10.0.0.1', length: '1 hour', tags: ['yoga', 'mat'], meta: { level: 2 }, embedding: [0.1, 0.2, 0.3] }],
    );
    const rows = (await db.query(`SELECT starts_at::text, status::text, host::text, length::text, tags, meta, embedding::text FROM slots WHERE id = 'a'`)).rows;
    expect(rows).toEqual([{ starts_at: '18:00:00', status: 'open', host: '10.0.0.1/32', length: '01:00:00', tags: ['yoga', 'mat'], meta: { level: 2 }, embedding: '[0.1,0.2,0.3]' }]);
  });

  it("stores a timestamp without time zone as insert does, whatever the session's time zone", async () => {
    const at = '2026-10-26T09:30:00Z';
    await write({ op: 'insert', table: 'slots', values: { id: { $context: 'id' }, at: { $context: 'at' } } }, { id: 'by-insert', at });
    await insertEach({ id: { $item: 'id' }, at: { $item: 'at' } }, [{ id: 'by-insertEach', at }]);
    const rows = (await db.query(`SELECT id, at::text FROM slots WHERE id LIKE 'by-%' ORDER BY id`)).rows;
    expect(rows).toEqual([
      { id: 'by-insert', at: '2026-10-26 09:30:00' },
      { id: 'by-insertEach', at: '2026-10-26 09:30:00' },
    ]);
  });

  it('refuses a fraction for an integer column, as insert does, and writes nothing', async () => {
    const refusal = 'invalid input syntax for type integer: "7.5"';
    await expect(write({ op: 'insert', table: 'slots', values: { id: { $context: 'id' }, seats: { $context: 'seats' } } }, { id: 'f1', seats: 7.5 })).rejects.toThrow(refusal);
    await expect(insertEach({ id: { $item: 'id' }, seats: { $item: 'seats' } }, [{ id: 'f2', seats: 7.5 }])).rejects.toThrow(refusal);
    expect((await db.query(`SELECT id FROM slots WHERE id IN ('f1', 'f2')`)).rows).toEqual([]);
  });

  it('leaves a NOT NULL domain column it does not write to its default, as insert does', async () => {
    await insertEach({ id: { $item: 'id' }, seats: { $item: 'seats' } }, [{ id: 'd1', seats: 4 }]);
    await insertEach({ id: { $item: 'id' }, places: { $item: 'places' } }, [{ id: 'd2', places: 3 }]);
    await expect(insertEach({ id: { $item: 'id' }, places: { $item: 'places' } }, [{ id: 'd3', places: null }])).rejects.toThrow('domain capacity does not allow null values');
    expect((await db.query(`SELECT id, places FROM slots WHERE id LIKE 'd%' ORDER BY id`)).rows).toEqual([
      { id: 'd1', places: 1 },
      { id: 'd2', places: 3 },
    ]);
  });

  it('writes one row per item when no value reads an item', async () => {
    await write({ op: 'insertEach', table: 'slots', items: { $context: 'rows' }, values: { id: { $context: 'id' } } }, { rows: [{}], id: 'c1' });
    expect((await db.query(`SELECT id FROM slots WHERE id = 'c1'`)).rows).toEqual([{ id: 'c1' }]);
  });
});
