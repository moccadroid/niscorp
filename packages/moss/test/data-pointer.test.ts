import { describe, it, expect } from 'vitest';
import { createPostgresAdapter } from '@niscorp/vex';
import type { DatabaseSchema, MutationClient, PgPool } from '@niscorp/vex';
import { createOwnEntries } from '../src/data/own-entries';
import { POINTER, createPointer } from '../src/data/own-entries';

// THE GENERATION POINTER'S ROW, THROUGH VEX. The two entries are seeded and
// replayed the way a feature's own are, compiled by vex's own Postgres
// adapter, over a pool that runs nothing: it keeps each statement it is sent
// and answers the rows it is told to. No database: what is held here is what
// moss asks vex for, and what it makes of the answer.

const SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'moss_generation',
      table: 'moss_generation',
      fields: [
        { name: 'id', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: true },
        { name: 'n', type: 'bigint', normalizedType: 'number', nullable: false, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'moss_generation_pkey', fields: ['id'], unique: true, type: 'btree' }],
    },
  ],
};

type Sent = { sql: string; params: readonly unknown[] };

// `answers` is what the database would hand back for the next statement. A
// read's rows come with the type of their column, as a driver sends them:
// `int8` is what vex's adapter turns into a number by itself, so a driver that
// says nothing of the type (`untyped`) leaves the text for moss to read.
const INT8 = 20;
const world = (answers: { read?: Record<string, unknown>[]; untyped?: boolean; written?: Record<string, unknown>[] } = {}) => {
  const read: Sent[] = [];
  const written: Sent[] = [];
  const invalidated: (readonly string[])[] = [];
  const pool: PgPool = {
    query: async (sql, params) => {
      read.push({ sql, params: params ?? [] });
      return { rows: answers.read ?? [{ n: 0 }], fields: answers.untyped === true ? [] : [{ name: 'n', dataTypeID: INT8 }] };
    },
    statementTimeouts: false,
  };
  const db: MutationClient = {
    query: async (sql, params) => {
      written.push({ sql, params: params ?? [] });
      return { rows: answers.written ?? [] };
    },
  };
  const replay = createOwnEntries({
    // What the database holds is said here: the pool answers rows and knows no
    // catalog.
    adapter: { ...createPostgresAdapter({ pool }), introspect: async () => SCHEMA },
    db,
    engine: { invalidate: (tables) => void invalidated.push([...tables]) },
  })(POINTER);
  return { pointer: createPointer(() => replay), read, written, invalidated };
};

describe('the generation pointer’s row, read through vex', () => {
  it('asks for `n` of the one row, and answers it as a number', async () => {
    const { pointer, read } = world({ read: [{ n: 7 }] });
    expect(await pointer.read()).toBe(7);
    expect(read).toHaveLength(1);
    expect(read[0]?.sql).toMatch(/^SELECT \S+\.n\b.* FROM moss_generation\b.* WHERE \S+\.id = 1\b/);
    // The row is named in the entry and by nobody who asks: no value is sent.
    expect(read[0]?.params).toEqual([]);
  });

  it('reads a BIGINT a driver hands over as text', async () => {
    const { pointer } = world({ read: [{ n: '41' }], untyped: true });
    expect(await pointer.read()).toBe(41);
  });

  it('a pointer with no row reads as zero', async () => {
    const { pointer } = world({ read: [] });
    expect(await pointer.read()).toBe(0);
  });

  it('a row whose `n` is not a number is not a reading', async () => {
    const { pointer } = world({ read: [{ n: 'soon' }], untyped: true });
    await expect(pointer.read()).rejects.toThrow();
  });
});

describe('the generation pointer’s row, moved through vex', () => {
  it('writes the next number where the counter is still what was read, and says it did', async () => {
    const { pointer, written, invalidated } = world({ written: [{ id: 1, n: 8 }] });
    expect(await pointer.move(7)).toBe(true);
    expect(written).toHaveLength(1);
    const sent = written[0];
    expect(sent?.sql).toMatch(/^UPDATE "?moss_generation"? SET "?n"? = \$(\d)\b.* WHERE .*\bid"? = 1\b.*\bn"? = \$(\d)\b/s);
    // The two numbers are values of the statement: the next one is what is
    // set, and the one that was read is what the row must still hold.
    const [, set, held] = /SET "?n"? = \$(\d)\b.*\bn"? = \$(\d)\b/s.exec(sent?.sql ?? '') ?? [];
    expect(sent?.params[Number(set) - 1]).toBe(8);
    expect(sent?.params[Number(held) - 1]).toBe(7);
    // The app's engine is told the table changed, as after any write.
    expect(invalidated).toEqual([['moss_generation']]);
  });

  it('says so when the counter had moved: no row was written', async () => {
    const { pointer, written } = world({ written: [] });
    expect(await pointer.move(7)).toBe(false);
    expect(written).toHaveLength(1);
  });
});
