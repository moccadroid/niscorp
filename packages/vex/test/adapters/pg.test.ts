import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { createPgPool, RAW_DATE_PARSERS } from '../../src/adapters/pg/index.js';

type Sent = {
  text: string;
  values?: unknown[];
  types?: { getTypeParser: (oid: number, format?: 'text' | 'binary') => (value: string) => unknown };
};

const FIELDS = [{ name: 'id', tableID: 16384, columnID: 1, dataTypeID: 25, dataTypeSize: -1, dataTypeModifier: -1, format: 'text' }];

const stubPool = () => {
  const onPool: Sent[] = [];
  const onClient: Sent[] = [];
  const released: number[] = [];
  const pool = {
    query: async (config: Sent) => {
      onPool.push(config);
      return { rows: [{ id: 'r1' }], fields: FIELDS };
    },
    connect: async () => ({
      query: async (config: Sent) => {
        onClient.push(config);
        return { rows: [{ id: 'r2' }], fields: FIELDS };
      },
      release: () => {
        released.push(1);
      },
    }),
  };
  return { pool, onPool, onClient, released };
};

const texts = (sent: Sent[]): string[] => sent.map((config) => config.text);

describe('the node-postgres pool shim', () => {
  it('commits a transaction on one client and returns what the callback returned', async () => {
    const { pool, onPool, onClient, released } = stubPool();
    const result = await createPgPool(pool).transaction?.(async (tx) => {
      await tx.query('INSERT INTO notes (id) VALUES ($1)', ['n1']);
      return 'done';
    });
    expect(result).toBe('done');
    expect(texts(onClient)).toEqual(['BEGIN', 'INSERT INTO notes (id) VALUES ($1)', 'COMMIT']);
    expect(onClient[1]?.values).toEqual(['n1']);
    expect(onPool).toEqual([]);
    expect(released).toHaveLength(1);
  });

  it('rolls back and rethrows when the callback throws, and still releases the client', async () => {
    const { pool, onClient, released } = stubPool();
    const failure = new Error('step failed');
    await expect(
      createPgPool(pool).transaction?.(async (tx) => {
        await tx.query('SELECT 1');
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(texts(onClient)).toEqual(['BEGIN', 'SELECT 1', 'ROLLBACK']);
    expect(released).toHaveLength(1);
  });

  it('reads DATE and TIMESTAMPTZ raw with the parsers, in and out of a transaction, and every other type as pg does', async () => {
    const { pool, onPool, onClient } = stubPool();
    const shimmed = createPgPool(pool, RAW_DATE_PARSERS);
    await shimmed.query('SELECT 1');
    await shimmed.transaction?.((tx) => tx.query('SELECT 2'));

    for (const sent of [onPool[0], onClient[1]]) {
      const types = sent?.types;
      expect(types?.getTypeParser(1082)('2026-10-26')).toBe('2026-10-26');
      expect(types?.getTypeParser(1184)('2026-10-26 09:30:00+00')).toBe('2026-10-26 09:30:00+00');
      expect(types?.getTypeParser(23)('42')).toBe(42);
    }
  });

  it("leaves pg's own parsing alone without parsers", async () => {
    const { pool, onPool } = stubPool();
    await createPgPool(pool).query('SELECT 1');
    expect(onPool[0]).toEqual({ text: 'SELECT 1' });
  });

  it('answers fields as name and type id only', async () => {
    const { pool } = stubPool();
    const shimmed = createPgPool(pool);
    const read = await shimmed.query('SELECT id FROM notes');
    const inTransaction = await shimmed.transaction?.((tx) => tx.query('SELECT id FROM notes'));
    expect(read).toEqual({ rows: [{ id: 'r1' }], fields: [{ name: 'id', dataTypeID: 25 }] });
    expect(inTransaction?.fields).toEqual([{ name: 'id', dataTypeID: 25 }]);
  });

  it('takes a pg.Pool as it is', async () => {
    const real = new pg.Pool();
    expect(createPgPool(real).transaction).toBeTypeOf('function');
    await real.end();
  });
});
