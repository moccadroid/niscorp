import { describe, expect, it } from 'vitest';
import { enforcementFor, parseTimeout } from '../../src/adapters/postgres/statement-timeout.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/postgres.adapter.js';
import type { PgPool } from '../../src/adapters/postgres/introspect.js';
import type { CompiledQuery } from '../../src/adapters/adapter.types.js';

// Where a read's time limit is enforced: on the connection when it already
// is (free), per statement when it is not (SET LOCAL in a transaction), and
// said to be unenforced when the database cannot (PGlite).

const poolShowing = (shown: string, log: string[] = []): PgPool => ({
  query: async (text) => {
    log.push(text);
    return { rows: text === 'SHOW statement_timeout' ? [{ statement_timeout: shown }] : [{ ok: 1 }], fields: [] };
  },
  transaction: async (fn) => fn({ query: async (text) => (log.push(`tx: ${text}`), { rows: [{ ok: 1 }], fields: [] }) }),
});

describe('parseTimeout', () => {
  it('reads Postgres units', () => {
    expect(parseTimeout('0')).toBe(0);
    expect(parseTimeout('250ms')).toBe(250);
    expect(parseTimeout('5s')).toBe(5000);
    expect(parseTimeout('1min')).toBe(60_000);
    expect(parseTimeout('750')).toBe(750);
    expect(parseTimeout('soon')).toBeUndefined();
  });
});

describe('enforcementFor', () => {
  it('the connection already enforces it at or under the ceiling', async () => {
    expect(await enforcementFor(poolShowing('5s'), 10_000)).toBe('connection');
  });

  it('no limit on the connection: per statement', async () => {
    expect(await enforcementFor(poolShowing('0'), 10_000)).toBe('statement');
  });

  it('a looser limit on the connection: per statement', async () => {
    expect(await enforcementFor(poolShowing('1min'), 10_000)).toBe('statement');
  });

  it('a database that cannot enforce it says so', async () => {
    expect(await enforcementFor({ ...poolShowing('0'), statementTimeouts: false }, 10_000)).toBe('unenforced');
  });

  it('a pool that cannot transact cannot wrap a statement', async () => {
    expect(await enforcementFor({ query: poolShowing('0').query }, 10_000)).toBe('unenforced');
  });
});

describe('the postgres adapter', () => {
  const read: CompiledQuery = { sql: 'SELECT 1', paramSlots: [], contextContract: {} };

  it('wraps each read in SET LOCAL when the connection does not enforce the limit', async () => {
    const log: string[] = [];
    const adapter = createPostgresAdapter({ pool: poolShowing('0', log) });
    expect(await adapter.limitReads?.(10_000)).toBe('statement');
    await adapter.execute(read, []);
    expect(log.slice(-2)).toEqual(['tx: SET LOCAL statement_timeout = 10000', 'tx: SELECT 1']);
  });

  it('reads plain when the connection already enforces it', async () => {
    const log: string[] = [];
    const adapter = createPostgresAdapter({ pool: poolShowing('5s', log) });
    expect(await adapter.limitReads?.(10_000)).toBe('connection');
    await adapter.execute(read, []);
    expect(log.at(-1)).toBe('SELECT 1');
  });

  // A driver's own object (a PGlite) has `transaction` as a method that
  // reaches for `this`. It is called on the pool, never taken off it.
  it('wraps a read on a pool whose `transaction` needs its receiver', async () => {
    const log: string[] = [];
    const pool: PgPool & { log: string[] } = {
      log,
      query: poolShowing('0', log).query,
      async transaction(fn) {
        return fn({ query: async (text) => (this.log.push(`tx: ${text}`), { rows: [{ ok: 1 }], fields: [] }) });
      },
    };
    const adapter = createPostgresAdapter({ pool });
    expect(await adapter.limitReads?.(10_000)).toBe('statement');
    await adapter.execute(read, []);
    expect(log.slice(-2)).toEqual(['tx: SET LOCAL statement_timeout = 10000', 'tx: SELECT 1']);
  });
});
