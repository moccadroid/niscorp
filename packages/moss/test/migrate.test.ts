import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Sequence } from '@niscorp/strata';
import { defineApp } from '../src/app';
import { createServer } from '../src/server';
import { migrateTables } from '../src/migrate';
import type { NiscRuntime } from '../src/runtime';

// THE STEP, AND WHAT IT REFUSES. An app with one table, in the shapes a few
// releases would give it, on one database that outlives them.

const sql = (text: string) => ({ kind: 'sql' as const, sql: text });

const NOTES = { description: 'notes', steps: [sql('CREATE TABLE notes (id serial PRIMARY KEY, body text NOT NULL, stars integer)')] };
const AUTHOR = { description: 'notes carry an author', steps: [sql('ALTER TABLE notes ADD COLUMN author text')] };
const TAGS = { description: 'tags', steps: [sql('CREATE TABLE tags (id serial PRIMARY KEY, name text NOT NULL)')] };
const RENAME = { description: 'notes.body is now notes.text', steps: [sql('ALTER TABLE notes RENAME COLUMN body TO text')] };

const tables = (...migrations: Sequence['migrations']): Sequence[] => [{ id: 'walk.app', migrations }];

const read = (fingerprint: string, ...columns: string[]): SeedEntry => ({
  fingerprint,
  // `fields` before `from`: jsonb stores them the other way round, so a seeded row is
  // only "as the code has it" by value, never by text
  dsl: { fields: columns.map((column) => `notes.${column}`), from: ['notes'] },
});
const add = (...columns: string[]): SeedMutation => ({
  fingerprint: 'notes/add',
  mutation: { op: 'insert', table: 'notes', values: Object.fromEntries(columns.map((column) => [column, { $context: column }])) },
});

const appOf = (...entries: (SeedEntry | SeedMutation)[]) => defineApp({ charter: { public: [] }, actions: {}, entries });

const database = () => {
  const db = new PGlite();
  const pool = createPglitePool(db);
  const runtimeOf = (sequences: Sequence[], migrations?: 'verify'): NiscRuntime => ({
    pool,
    db: pool,
    session: 'sessions',
    tables: sequences,
    ...(migrations === undefined ? {} : { migrations }),
  });
  const columns = async (): Promise<string[]> =>
    (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'notes' ORDER BY ordinal_position`)).rows.map((row) => String(row['column_name']));
  const ledger = async (): Promise<string[]> =>
    (await pool.query(`SELECT sequence || '/' || n AS ref FROM strata_ledger WHERE sequence = 'walk.app' ORDER BY n`)).rows.map((row) => String(row['ref']));
  return { runtimeOf, columns, ledger, pool };
};

// PGlite announces that it cannot bound reads; that line is not these tests.
const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    return await run();
  } finally {
    warn.mockRestore();
  }
};

describe('migrateTables — the step', () => {
  it("runs every owner's tables, the app's own with them — and a verifying boot then starts", async () => {
    const { runtimeOf } = database();
    const app = appOf(read('notes/all', 'id', 'body'), add('body'));

    const unmigrated = await quietly(() => createServer(app, runtimeOf(tables(NOTES), 'verify'))).catch((error: unknown) => error);
    expect(unmigrated).toMatchObject({ code: 'PENDING' });
    expect(String(unmigrated)).toContain('walk.app/1');

    const report = await migrateTables(runtimeOf(tables(NOTES)), app);
    const applied = report.applied.map((migration) => migration.ref);
    expect(applied).toEqual(expect.arrayContaining(['nisc.moss/1', 'nisc.moss.sessions/1', 'nisc.vex.cache/1']));
    // the app's own after the engine's
    expect(applied.at(-1)).toBe('walk.app/1');

    const server = await quietly(() => createServer(app, runtimeOf(tables(NOTES), 'verify')));
    server.close();
  });

  it('applies a migration that leaves every entry fitting', async () => {
    const { runtimeOf, columns } = database();
    await migrateTables(runtimeOf(tables(NOTES)), appOf(read('notes/all', 'id', 'body'), add('body')));
    const report = await migrateTables(runtimeOf(tables(NOTES, AUTHOR)), appOf(read('notes/all', 'id', 'body', 'author'), add('body', 'author')));
    expect(report.applied.map((migration) => migration.ref)).toEqual(['walk.app/2']);
    expect(report).toMatchObject({ removed: [], retyped: [], alreadyBroken: [] });
    expect(await columns()).toEqual(['id', 'body', 'stars', 'author']);
  });

  it('reads an optional condition as the engine does — its fields are checked, and it is not a refusal', async () => {
    const { runtimeOf } = database();
    const search = (column: string): SeedEntry => ({
      fingerprint: 'notes/search',
      dsl: { from: ['notes'], fields: ['notes.id'], filter: { optional: { key: 'q', then: { eq: [`notes.${column}`, { $context: 'q' }] } } } },
    });
    await expect(migrateTables(runtimeOf(tables(NOTES)), appOf(search('body')))).resolves.toMatchObject({ alreadyBroken: [] });
    const error = await migrateTables(runtimeOf(tables(NOTES)), appOf(search('gone'))).catch((e: unknown) => e);
    expect(String(error)).toContain('notes/search: Field "gone" not found');
  });

  it('refuses a migration its own code does not fit — naming the entries, applying nothing', async () => {
    const { runtimeOf, columns, ledger } = database();
    const app = appOf(read('notes/all', 'id', 'body'), add('body'));
    await migrateTables(runtimeOf(tables(NOTES)), app);

    // the migration renames the column; the entries still say `body`
    const error = await migrateTables(runtimeOf(tables(NOTES, RENAME)), app).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'DOES_NOT_FIT' });
    expect(String(error)).toContain('notes/all: Field "body" not found on entity "notes"');
    expect(String(error)).toContain('notes/add: Unknown column "notes.body".');
    expect(await columns()).toEqual(['id', 'body', 'stars']);
    expect(await ledger()).toEqual(['walk.app/1']);
  });

  it('refuses a migration that takes away what a write is keyed on', async () => {
    const { runtimeOf, ledger } = database();
    const remove: SeedMutation = { fingerprint: 'notes/remove', mutation: { op: 'delete', table: 'notes', where: { eq: ['notes.id', { $context: 'id' }] } } };
    const app = appOf(add('body'), remove);
    await migrateTables(runtimeOf(tables(NOTES)), app);

    const renamed = { description: 'notes.id is now notes.note_id', steps: [sql('ALTER TABLE notes RENAME COLUMN id TO note_id')] };
    const error = await migrateTables(runtimeOf(tables(NOTES, renamed)), app).catch((e: unknown) => e);
    expect(String(error)).toContain('notes/remove: "notes.id" in the WHERE is not a column of "notes".');
    expect(await ledger()).toEqual(['walk.app/1']);
  });

  it('refuses a NEW entry that no migration provides for — though it never fitted this database', async () => {
    const { runtimeOf, ledger } = database();
    const before = appOf(read('notes/all', 'id', 'body'), add('body'));
    await migrateTables(runtimeOf(tables(NOTES)), before);
    (await quietly(() => createServer(before, runtimeOf(tables(NOTES))))).close(); // its entries are seeded

    // the code now reads `author`; the release migrates nothing
    const error = await migrateTables(runtimeOf(tables(NOTES)), appOf(read('notes/all', 'id', 'body', 'author'), add('body'))).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'DOES_NOT_FIT' });
    expect(String(error)).toContain('notes/all: Field "author" not found');
    expect(await ledger()).toEqual(['walk.app/1']);
  });

  it('does not refuse for an entry that was already seeded as it is and already did not fit — it says so', async () => {
    const { runtimeOf, ledger, pool } = database();
    const deadWrite: SeedMutation = { fingerprint: 'notes/dead-write', mutation: { op: 'insert', table: 'notes', values: { gone: { $context: 'gone' } } } };
    const app = appOf(read('notes/all', 'id', 'body'), read('notes/dead', 'id', 'gone'), add('body'), deadWrite);
    await migrateTables(runtimeOf(tables(NOTES)), appOf(read('notes/all', 'id', 'body'), add('body')));
    (await quietly(() => createServer(app, runtimeOf(tables(NOTES))))).close(); // ships the dead entries: boot does not check them

    // asked through a cache with memory in front that nobody warmed: a deployment's cache, in the step's own process
    const cold = createTieredCache({ l1: createMemoryCache(), l2: createPostgresCache({ pool }) });
    const report = await migrateTables({ ...runtimeOf(tables(NOTES, TAGS)), cache: cold }, app);
    expect(report.applied.map((migration) => migration.ref)).toEqual(['walk.app/2']);
    expect(report.alreadyBroken.map((line) => line.split(':')[0])).toEqual(['notes/dead', 'notes/dead-write']);
    expect(report.alreadyBroken[0]).toContain('notes/dead: Field "gone" not found');
    expect(await ledger()).toEqual(['walk.app/1', 'walk.app/2']);
  });

  it('a row the database holds but nobody seeded is not a seed: the entry is new, and refused', async () => {
    const { runtimeOf, pool } = database();
    await migrateTables(runtimeOf(tables(NOTES)), appOf(read('notes/all', 'id', 'body'), add('body')));
    const learned = read('notes/learned', 'id', 'gone');
    await createPostgresCache({ pool }).set(learned.fingerprint, { kind: 'ok', dsl: learned.dsl, createdAt: Date.now() });

    const error = await migrateTables(runtimeOf(tables(NOTES)), appOf(read('notes/all', 'id', 'body'), learned, add('body'))).catch((e: unknown) => e);
    expect(String(error)).toContain('notes/learned: Field "gone" not found');
  });

  it('says what a run removes and what it retypes', async () => {
    const { runtimeOf } = database();
    const app = appOf(read('notes/all', 'id', 'body'), add('body'));
    await migrateTables(runtimeOf(tables(NOTES, TAGS)), app);

    const report = await migrateTables(
      runtimeOf(
        tables(NOTES, TAGS, {
          description: 'stars are counted wider; tags go',
          steps: [sql('ALTER TABLE notes ALTER COLUMN stars TYPE bigint'), sql('DROP TABLE tags')],
        }),
      ),
      app,
    );
    expect(report.removed).toEqual(['tags']);
    expect(report.retyped).toEqual(['notes.stars (integer → bigint)']);
  });

  it('a run that waited for another, and so applied nothing, says it took nothing away', async () => {
    const { runtimeOf } = database();
    const app = appOf(read('notes/all', 'id', 'body'), add('body'));
    await migrateTables(runtimeOf(tables(NOTES)), app);

    // one release, stepped twice at once: the other run gets the lock first
    const dropped = { description: 'stars go', steps: [sql('ALTER TABLE notes DROP COLUMN stars')] };
    const runtime = runtimeOf(tables(NOTES, dropped));
    const waited: NiscRuntime = {
      ...runtime,
      pool: {
        ...runtime.pool,
        transaction: async (fn) => {
          expect((await migrateTables(runtime, app)).removed).toEqual(['notes.stars']);
          if (runtime.pool.transaction === undefined) throw new Error('the test pool transacts');
          return runtime.pool.transaction(fn);
        },
      },
    };
    expect(await migrateTables(waited, app)).toMatchObject({ applied: [], removed: [], retyped: [] });
  });

  it('a dry run reports the same and applies none of it', async () => {
    const { runtimeOf, columns, ledger } = database();
    const app = appOf(read('notes/all', 'id', 'body'), add('body'));
    await migrateTables(runtimeOf(tables(NOTES)), app);

    const dropped = { description: 'stars go', steps: [sql('ALTER TABLE notes DROP COLUMN stars')] };
    const report = await migrateTables(runtimeOf(tables(NOTES, dropped)), app, { dryRun: true });
    expect(report.applied.map((migration) => migration.ref)).toEqual(['walk.app/2']);
    expect(report.removed).toEqual(['notes.stars']);
    expect(await columns()).toEqual(['id', 'body', 'stars']);
    expect(await ledger()).toEqual(['walk.app/1']);
  });
});
