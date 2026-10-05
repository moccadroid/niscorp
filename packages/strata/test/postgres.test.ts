import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createUpgrader, type Sequence } from '../src';
import { migrate, readLedger, status, upgradeStore, type StrataPool, type StrataQuery } from '../src/postgres';

// A PGlite database in the pool shape — query plus a pinned transaction.
const freshPool = (): StrataPool & { db: PGlite } => {
  const db = new PGlite();
  return {
    db,
    query: (text, values) => db.query(text, values),
    transaction: (fn) => db.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
  };
};

const sql = (s: string) => ({ kind: 'sql' as const, sql: s });

const columnsOf = async (pool: StrataPool, table: string): Promise<string[]> => {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => String(r['column_name']));
};

const cache: Sequence = {
  id: 'nisc.vex.cache',
  migrations: [
    { description: 'The cache table', steps: [sql('CREATE TABLE vex_cache (key text PRIMARY KEY)')] },
    { description: 'Rows remember their request', steps: [sql('ALTER TABLE vex_cache ADD COLUMN request_hash text')] },
  ],
};

describe('migrate — the ledger', () => {
  it('applies a fresh database in order and records every migration', async () => {
    const pool = freshPool();
    const report = await migrate(pool, [cache]);
    expect(report.applied.map((m) => m.ref)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
    expect(await columnsOf(pool, 'vex_cache')).toEqual(['key', 'request_hash']);
    const ledger = await readLedger(pool);
    expect(ledger.map((r) => `${r.sequence}/${r.n}`)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
    expect(ledger[0]?.description).toBe('The cache table');
  });

  it('a second run does nothing — once, not every boot', async () => {
    const pool = freshPool();
    await migrate(pool, [cache]);
    const again = await migrate(pool, [cache]);
    expect(again.applied).toEqual([]);
    expect(again.plan.applied).toEqual({ 'nisc.vex.cache': 2 });
  });

  it('an appended migration runs alone on the next boot', async () => {
    const pool = freshPool();
    await migrate(pool, [cache]);
    const grown: Sequence = { ...cache, migrations: [...cache.migrations, { description: 'Rows know their reach', steps: [sql('ALTER TABLE vex_cache ADD COLUMN reach text')] }] };
    const report = await migrate(pool, [grown]);
    expect(report.applied.map((m) => m.ref)).toEqual(['nisc.vex.cache/3']);
    expect(await columnsOf(pool, 'vex_cache')).toEqual(['key', 'request_hash', 'reach']);
  });

  it('refuses a database whose applied migration was edited in code — and changes nothing', async () => {
    const pool = freshPool();
    await migrate(pool, [cache]);
    const edited: Sequence = { ...cache, migrations: [{ description: 'The cache table', steps: [sql('CREATE TABLE vex_cache (key text PRIMARY KEY, extra int)')] }, ...cache.migrations.slice(1)] };
    await expect(migrate(pool, [edited])).rejects.toMatchObject({ code: 'EDITED' });
    expect(await columnsOf(pool, 'vex_cache')).toEqual(['key', 'request_hash']);
  });

  it('refuses a database migrated by newer code', async () => {
    const pool = freshPool();
    const newer: Sequence = { ...cache, migrations: [...cache.migrations, { description: 'Later', steps: [sql('ALTER TABLE vex_cache ADD COLUMN later text')] }] };
    await migrate(pool, [newer]);
    await expect(migrate(pool, [cache])).rejects.toMatchObject({ code: 'TOO_NEW' });
  });

  it('a failing step rolls back the WHOLE run — tables and ledger', async () => {
    const pool = freshPool();
    const broken: Sequence = {
      id: 'acme.app',
      migrations: [
        { description: 'People', steps: [sql('CREATE TABLE people (id text PRIMARY KEY)')] },
        { description: 'Broken', steps: [sql('ALTER TABLE nowhere ADD COLUMN x int')] },
      ],
    };
    const error = await migrate(pool, [cache, broken]).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'STEP_FAILED' });
    expect(String(error)).toContain('acme.app/2');
    expect(await columnsOf(pool, 'vex_cache')).toEqual([]);
    expect(await columnsOf(pool, 'people')).toEqual([]);
    expect(await readLedger(pool)).toEqual([]);
  });

  it('verify mode refuses pending work instead of doing it', async () => {
    const pool = freshPool();
    const error = await migrate(pool, [cache], { mode: 'verify' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'PENDING' });
    expect(String(error)).toContain('nisc.vex.cache/1');
    expect(await columnsOf(pool, 'vex_cache')).toEqual([]);
    await migrate(pool, [cache]);
    await expect(migrate(pool, [cache], { mode: 'verify' })).resolves.toMatchObject({ applied: [] });
  });

  it('a pool that cannot transact is refused with the reason', async () => {
    const pool = freshPool();
    await expect(migrate({ query: pool.query }, [cache])).rejects.toMatchObject({ code: 'NO_TRANSACTION' });
  });

  // A driver's own object has `query` and `transaction` as methods that need
  // their receiver. They are called on the object, so one works as it is.
  it('a PGlite works as it is — its methods are called on it, never taken off it', async () => {
    const db = new PGlite();
    expect((await migrate(db, [cache])).applied.map((m) => m.ref)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
    expect((await migrate(db, [cache])).applied).toEqual([]);
    // Once a ledger exists, reading it goes through `query` too.
    expect((await status(db, [cache])).pending).toEqual([]);
    expect((await readLedger(db)).map((row) => `${row.sequence}/${row.n}`)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
  });

  it('a transaction whose `query` needs its receiver works — a client handed through as it is', async () => {
    const db = new PGlite();
    // The shape of a checked-out `pg` client: `query` is a method on it.
    const clientOver = (inner: { query: StrataQuery }) => ({
      inner,
      query(this: { inner: { query: StrataQuery } }, text: string, values?: unknown[]) {
        return this.inner.query(text, values);
      },
    });
    const pool: StrataPool = {
      query: (text, values) => db.query(text, values),
      transaction: (fn) => db.transaction((tx) => fn(clientOver({ query: (text, values) => tx.query(text, values) }))),
    };
    expect((await migrate(pool, [cache])).applied.map((m) => m.ref)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
    expect(await columnsOf(pool, 'vex_cache')).toEqual(['key', 'request_hash']);
  });

  it('status plans without touching anything — not even the ledger table', async () => {
    const pool = freshPool();
    const plan = await status(pool, [cache]);
    expect(plan.pending.map((m) => m.ref)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
    expect(await columnsOf(pool, 'strata_ledger')).toEqual([]);
  });

  it('the ledger can live under another name and schema', async () => {
    const pool = freshPool();
    await migrate(pool, [cache], { table: 'migrations', schema: 'ops' });
    expect((await readLedger(pool, { table: 'migrations', schema: 'ops' })).length).toBe(2);
    expect(await readLedger(pool)).toEqual([]);
  });
});

describe('adoption — a database created the old way', () => {
  // Before strata, packages converged their tables on every boot with
  // CREATE … IF NOT EXISTS + ADD COLUMN IF NOT EXISTS. A baseline written the
  // same way is its own adoption: run once over ANY earlier shape, it lands the
  // current one — and is recorded, so it never runs again.
  const baseline: Sequence = {
    id: 'nisc.vex.cache',
    migrations: [
      {
        description: 'The vex cache table, converged from any earlier shape',
        steps: [
          sql('CREATE TABLE IF NOT EXISTS vex_cache (key text PRIMARY KEY, request_hash text, refresh text)'),
          sql('ALTER TABLE vex_cache ADD COLUMN IF NOT EXISTS request_hash text'),
          sql('ALTER TABLE vex_cache ADD COLUMN IF NOT EXISTS refresh text'),
        ],
      },
    ],
  };

  it('an older deployment (missing a later column) converges and is recorded', async () => {
    const pool = freshPool();
    await pool.query('CREATE TABLE vex_cache (key text PRIMARY KEY, request_hash text)');
    await pool.query(`INSERT INTO vex_cache (key) VALUES ('kept')`);
    const report = await migrate(pool, [baseline]);
    expect(report.applied.map((m) => m.ref)).toEqual(['nisc.vex.cache/1']);
    expect(await columnsOf(pool, 'vex_cache')).toEqual(['key', 'request_hash', 'refresh']);
    const { rows } = await pool.query('SELECT key FROM vex_cache');
    expect(rows).toEqual([{ key: 'kept' }]);
  });

  it('a fresh database gets the same shape from the same baseline', async () => {
    const pool = freshPool();
    await migrate(pool, [baseline]);
    expect(await columnsOf(pool, 'vex_cache')).toEqual(['key', 'request_hash', 'refresh']);
  });
});

describe('upgradeStore — rows that hold documents', () => {
  const grammar = (migrations: Sequence['migrations']): Sequence => ({ id: 'acme.forms', documents: { form: {} }, migrations });
  const renameTitle = {
    description: 'title → heading',
    steps: [
      {
        kind: 'document' as const,
        at: 'acme.forms/form',
        transform: ({ document }: { document: Record<string, unknown> }) => {
          const { title, ...rest } = document;
          return title === undefined ? document : { ...rest, heading: title };
        },
      },
    ],
  };
  const transform = (config: unknown, source: unknown): unknown => (typeof config === 'function' ? config(source) : source);
  const store = { table: 'forms', column: 'definition', stamp: 'grammar', kind: 'acme.forms/form', key: ['id'] };

  const withForms = async () => {
    const pool = freshPool();
    await pool.query(`CREATE TABLE forms (id text PRIMARY KEY, definition jsonb NOT NULL, grammar jsonb NOT NULL DEFAULT '{}'::jsonb)`);
    await pool.query(`INSERT INTO forms (id, definition) VALUES ('a', '{"title":"Sign up"}'), ('b', '{"title":"Contact"}')`);
    await pool.query(`INSERT INTO forms (id, definition, grammar) VALUES ('c', '{"heading":"Already"}', '{"acme.forms":1}')`);
    return pool;
  };

  it('rewrites the rows that are behind, stamps them current, leaves the current ones alone', async () => {
    const pool = await withForms();
    const upgrader = await createUpgrader([grammar([renameTitle])], { transform });
    const report = await upgradeStore(pool, store, upgrader);
    expect(report).toEqual({ total: 3, upgraded: 2, applied: { 'acme.forms/1': 2 } });
    const { rows } = await pool.query('SELECT id, definition, grammar FROM forms ORDER BY id');
    expect(rows).toEqual([
      { id: 'a', definition: { heading: 'Sign up' }, grammar: { 'acme.forms': 1 } },
      { id: 'b', definition: { heading: 'Contact' }, grammar: { 'acme.forms': 1 } },
      { id: 'c', definition: { heading: 'Already' }, grammar: { 'acme.forms': 1 } },
    ]);
    expect(await upgradeStore(pool, store, upgrader)).toEqual({ total: 3, upgraded: 0, applied: {} });
  });

  it('a PGlite works as it is here too', async () => {
    const { db } = await withForms();
    const upgrader = await createUpgrader([grammar([renameTitle])], { transform });
    expect(await upgradeStore(db, store, upgrader)).toEqual({ total: 3, upgraded: 2, applied: { 'acme.forms/1': 2 } });
  });

  // Two deployments over one table, one of them without a grammar the other has.
  it('a row keeps its stamp entry for a grammar the upgrader was not given — its migration is not run twice', async () => {
    const pool = freshPool();
    await pool.query(`CREATE TABLE forms (id text PRIMARY KEY, definition jsonb NOT NULL, grammar jsonb NOT NULL DEFAULT '{}'::jsonb)`);
    // Written by code that had both grammars: prices already in cents (acme.prices 1), the title not yet renamed.
    await pool.query(`INSERT INTO forms (id, definition, grammar) VALUES ('a', '{"title":"Seats","price":1200}', '{"acme.forms":0,"acme.prices":1}')`);
    const prices: Sequence = {
      id: 'acme.prices',
      documents: {},
      migrations: [
        {
          description: 'price: whole units → cents',
          steps: [{ kind: 'document', at: 'acme.forms/form', transform: ({ document }: { document: Record<string, unknown> }) => ({ ...document, price: Number(document['price']) * 100 }) }],
        },
      ],
    };
    const row = async () => (await pool.query('SELECT definition, grammar FROM forms')).rows[0];

    const formsOnly = await createUpgrader([grammar([renameTitle])], { transform });
    expect(await upgradeStore(pool, store, formsOnly)).toEqual({ total: 1, upgraded: 1, applied: { 'acme.forms/1': 1 } });
    expect(await row()).toEqual({ definition: { heading: 'Seats', price: 1200 }, grammar: { 'acme.forms': 1, 'acme.prices': 1 } });

    const both = await createUpgrader([grammar([renameTitle]), prices], { transform });
    expect(await upgradeStore(pool, store, both)).toEqual({ total: 1, upgraded: 0, applied: {} });
    expect(await row()).toEqual({ definition: { heading: 'Seats', price: 1200 }, grammar: { 'acme.forms': 1, 'acme.prices': 1 } });
  });

  it('a row written by newer code refuses the whole pass — nothing is rewritten', async () => {
    const pool = await withForms();
    await pool.query(`INSERT INTO forms (id, definition, grammar) VALUES ('z', '{"heading":"From the future"}', '{"acme.forms":7}')`);
    const upgrader = await createUpgrader([grammar([renameTitle])], { transform });
    const error = await upgradeStore(pool, store, upgrader).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TOO_NEW' });
    expect(String(error)).toContain('forms (id="z")');
    const { rows } = await pool.query(`SELECT definition FROM forms WHERE id = 'a'`);
    expect(rows[0]?.['definition']).toEqual({ title: 'Sign up' });
  });
});
