import { describe, it, expect } from 'vitest';
import { createPglitePool, RAW_DATE_PARSERS } from '../../src/adapters/pglite/index.js';
import { executeMutation } from '../../src/mutations/engine.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// The shim had no test, and the gap was not cosmetic: it returned `{ query }`
// only, so `MutationClient.transaction` was undefined on every PGlite-backed
// app and every BATCH mutation threw "Batch mutations require a transactional
// client" — a message about a client nothing in the repo could construct.
//
// Structurally typed, like the shim itself, so this file takes no dependency
// on @electric-sql/pglite.

type Call = { text: string; values?: unknown[]; options?: unknown };

const fakeDb = () => {
  const calls: Call[] = [];
  const query = async (text: string, values?: unknown[], options?: unknown) => {
    calls.push({ text, values, options });
    return { rows: [{ id: 'r1' }] };
  };
  return {
    calls,
    db: {
      query,
      transaction: async <T>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> => fn({ query }),
    },
  };
};

describe('the PGlite pool shim', () => {
  it('passes the transaction through, so batch mutations are possible at all', () => {
    const { db } = fakeDb();
    expect(createPglitePool(db).transaction).toBeTypeOf('function');
  });

  it('omits it when the db cannot transact, rather than faking one', () => {
    // A hand-rolled BEGIN/COMMIT over a single `query` would be wrong on a
    // real pool — the statements could land on different connections — so a
    // db with no transaction yields a pool that says so.
    const { db } = fakeDb();
    expect(createPglitePool({ query: db.query }).transaction).toBeUndefined();
  });

  it('carries the date parsers into the transaction as well as out of it', () => {
    const { calls, db } = fakeDb();
    const pool = createPglitePool(db, RAW_DATE_PARSERS);
    void pool.transaction?.((tx) => tx.query('SELECT 1'));
    void pool.query('SELECT 2');
    expect(calls.every((call) => call.options !== undefined)).toBe(true);
  });

  it('a batch mutation now runs instead of throwing', async () => {
    const schema: DatabaseSchema = {
      entities: [
        {
          name: 'notes',
          table: 'notes',
          fields: [
            { name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true },
            { name: 'body', type: 'text', normalizedType: 'string', nullable: true, primaryKey: false },
          ],
          relations: [],
          indexes: [],
        },
      ],
    };
    const policy: ScopePolicy = { default: 'allow', entities: {} };
    const { calls, db } = fakeDb();

    const rows = await executeMutation(
      createPglitePool(db),
      [
        { op: 'insert', table: 'notes', values: { id: 'n1', body: 'one' } },
        { op: 'insert', table: 'notes', values: { id: 'n2', body: 'two' } },
      ],
      { context: {}, scope: {}, policy, schema },
    );

    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(2);
  });
});
