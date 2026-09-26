import { describe, it, expect } from 'vitest';
import { prepare, planMigrations, checksumOf, sqlSteps, StrataError, type LedgerRow, type Sequence } from '../src';

const sql = (s: string) => ({ kind: 'sql' as const, sql: s });

const cache: Sequence = {
  id: 'nisc.vex.cache',
  migrations: [
    { description: 'The cache table', steps: [sql('CREATE TABLE vex_cache (key text PRIMARY KEY)')] },
    { description: 'Rows remember their request', steps: [sql('ALTER TABLE vex_cache ADD COLUMN request_hash text')] },
  ],
};

const app: Sequence = {
  id: 'acme.app',
  migrations: [
    { description: 'People', steps: [sql('CREATE TABLE people (id text PRIMARY KEY)')] },
    // reads the cache table, so the cache must be there first
    { description: 'A view over both', steps: [sql('CREATE VIEW v AS SELECT 1')], dependsOn: ['nisc.vex.cache/2'] },
  ],
};

const rowFor = async (sequence: Sequence, n: number): Promise<LedgerRow> => {
  const migration = sequence.migrations[n - 1];
  if (migration === undefined) throw new Error('no such migration');
  return { sequence: sequence.id, n, checksum: await checksumOf(migration), description: migration.description, appliedAt: '2026-09-01T00:00:00.000Z' };
};

describe('plan — what runs, in what order', () => {
  it('a fresh database runs everything, each sequence in order', async () => {
    const plan = planMigrations(await prepare([cache]), []);
    expect(plan.problems).toEqual([]);
    expect(plan.pending.map((m) => m.ref)).toEqual(['nisc.vex.cache/1', 'nisc.vex.cache/2']);
    expect(plan.applied).toEqual({ 'nisc.vex.cache': 0 });
  });

  it('an up-to-date database runs nothing', async () => {
    const plan = planMigrations(await prepare([cache]), [await rowFor(cache, 1), await rowFor(cache, 2)]);
    expect(plan.pending).toEqual([]);
    expect(plan.applied).toEqual({ 'nisc.vex.cache': 2 });
  });

  it('dependsOn orders across sequences — even when the dependent sequence is listed first', async () => {
    const plan = planMigrations(await prepare([app, cache]), []);
    expect(plan.problems).toEqual([]);
    expect(plan.pending.map((m) => m.ref)).toEqual(['acme.app/1', 'nisc.vex.cache/1', 'nisc.vex.cache/2', 'acme.app/2']);
  });

  it('the same input always plans the same order', async () => {
    const a = planMigrations(await prepare([app, cache]), []).pending.map((m) => m.ref);
    const b = planMigrations(await prepare([app, cache]), []).pending.map((m) => m.ref);
    expect(a).toEqual(b);
  });

  it('a dependency the ledger already holds is satisfied, even if its sequence is not passed', async () => {
    const plan = planMigrations(await prepare([app]), [await rowFor(cache, 1), await rowFor(cache, 2)]);
    expect(plan.problems).toEqual([]);
    expect(plan.pending.map((m) => m.ref)).toEqual(['acme.app/1', 'acme.app/2']);
  });
});

describe('plan — refusals', () => {
  it('an applied migration whose steps changed is EDITED', async () => {
    const edited: Sequence = { ...cache, migrations: [{ description: 'The cache table', steps: [sql('CREATE TABLE vex_cache (key text PRIMARY KEY, extra int)')] }, ...cache.migrations.slice(1)] };
    const plan = planMigrations(await prepare([edited]), [await rowFor(cache, 1)]);
    expect(plan.problems.map((p) => p.code)).toEqual(['EDITED']);
  });

  it('rewording a description is not an edit — prose is not the effect', async () => {
    const reworded: Sequence = { ...cache, migrations: [{ ...cache.migrations[0], description: 'The vex cache table', steps: cache.migrations[0]?.steps ?? [] }] };
    const plan = planMigrations(await prepare([reworded]), [await rowFor(cache, 1)]);
    expect(plan.problems).toEqual([]);
  });

  it('a database migrated by newer code is TOO_NEW', async () => {
    const newer: Sequence = { ...cache, migrations: [...cache.migrations, { description: 'Later', steps: [sql('SELECT 1')] }] };
    const ledger = [await rowFor(newer, 1), await rowFor(newer, 2), await rowFor(newer, 3)];
    const plan = planMigrations(await prepare([cache]), ledger);
    expect(plan.problems.map((p) => p.code)).toEqual(['TOO_NEW']);
  });

  it('a hole in the ledger is refused', async () => {
    const plan = planMigrations(await prepare([cache]), [await rowFor(cache, 2)]);
    expect(plan.problems.map((p) => p.code)).toEqual(['EDITED']);
  });

  it('a dependency nobody provides is UNKNOWN_DEPENDENCY', async () => {
    const plan = planMigrations(await prepare([app]), []);
    expect(plan.problems.map((p) => p.code)).toEqual(['UNKNOWN_DEPENDENCY']);
  });

  it('migrations waiting on each other are a CYCLE', async () => {
    const a: Sequence = { id: 'x.a', migrations: [{ description: 'a', steps: [], dependsOn: ['x.b/1'] }] };
    const b: Sequence = { id: 'x.b', migrations: [{ description: 'b', steps: [], dependsOn: ['x.a/1'] }] };
    const plan = planMigrations(await prepare([a, b]), []);
    expect(plan.problems.map((p) => p.code)).toEqual(['CYCLE']);
  });

  it('a sequence that does not parse is refused with what is wrong', async () => {
    const bad = { id: 'NotNamespaced', migrations: [{ description: '', steps: [] }] };
    await expect(prepare([bad])).rejects.toMatchObject({ code: 'INVALID_SEQUENCE' });
    await expect(prepare([bad])).rejects.toBeInstanceOf(StrataError);
  });

  it('two sequences with one id are refused', async () => {
    await expect(prepare([cache, cache])).rejects.toMatchObject({ code: 'INVALID_SEQUENCE' });
  });
});

describe('checksum', () => {
  it('ignores full-line SQL comments and trailing whitespace — documentation is not the effect', async () => {
    const bare = await checksumOf({ description: 'x', steps: [{ kind: 'sql', sql: 'CREATE TABLE t (\n  id int\n)' }] });
    const documented = await checksumOf({ description: 'x', steps: [{ kind: 'sql', sql: '-- the table\nCREATE TABLE t (  \n  -- the key\n  id int\n)\n' }] });
    const changed = await checksumOf({ description: 'x', steps: [{ kind: 'sql', sql: 'CREATE TABLE t (\n  id bigint\n)' }] });
    expect(documented).toBe(bare);
    expect(changed).not.toBe(bare);
  });

  it('is stable across key order and ignores description and dependsOn', async () => {
    const a = await checksumOf({ description: 'one', steps: [{ kind: 'sql', sql: 'SELECT 1' }] });
    const b = await checksumOf({ steps: [{ sql: 'SELECT 1', kind: 'sql' }], description: 'two', dependsOn: ['x.y/1'] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sqlSteps — a DDL file as one statement per step', () => {
  it('never splits inside a comment, even one with a semicolon', () => {
    const steps = sqlSteps(`
  -- The departments. Each is a role; \`remit\` says what it may do.
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY  -- the key; never reused
  );

  -- One row per person; NULL until assigned.
  CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY);
`);
    expect(steps.map((s) => s.sql.split('\n').filter((l) => !l.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim())).toEqual([
      'CREATE TABLE IF NOT EXISTS departments ( id TEXT PRIMARY KEY -- the key; never reused )',
      'CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY)',
    ]);
  });

  it('a trailing statement without a semicolon is kept; comment-only tails are not steps', () => {
    expect(sqlSteps('CREATE TABLE a (x int);\nCREATE TABLE b (y int)\n-- the end').map((s) => s.sql.split('\n')[0])).toEqual(['CREATE TABLE a (x int)', 'CREATE TABLE b (y int)']);
  });
});
