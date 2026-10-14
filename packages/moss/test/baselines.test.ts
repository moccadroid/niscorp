import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { createMemoryCache, createPostgresAdapter, createQueryEngine, handleQuery, seedCache } from '@niscorp/vex';
import type { SeedMutation } from '@niscorp/vex';
import { createPglitePool } from '@niscorp/vex/pglite';
import { checksumOf, type Sequence } from '@niscorp/strata';
import { readLedger } from '@niscorp/strata/postgres';
import { SAVE_ENTRIES, SAVE_ROW_RULES, savedRowsOver } from '../src/artifactory';
import { MOSS_SEQUENCE } from '../src/data';
import { createGrammarUpgrader } from '../src/data/engine';
import { createOwnEntries } from '../src/data/own-entries';
import { SESSIONS_SEQUENCE } from '../src/identity';
import { createServer } from '../src/server';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

// Deployed databases have recorded these checksums, and an edited migration refuses to boot there.
// When one goes red, put the change back and append a new migration; do not re-pin.

const PINNED: ReadonlyArray<[Sequence, number, string]> = [
  [MOSS_SEQUENCE, 1, '1c21031de558301ea60804cce1ed1e5c636aa8644fcdedc1ef96f5bebb558880'],
  [MOSS_SEQUENCE, 2, '92bd612e35a830e2f58de2327451a8e3346e7bc102ab0b49777c349792894b1a'],
  [MOSS_SEQUENCE, 3, 'b05aa252f4f3b70dad03282552ac6b94c5d4e5012d964c23cb32fedbb4f8b60f'],
  [MOSS_SEQUENCE, 4, 'd4fdae75451da4bb3d46c6b31c8ad1797f1c0a487eb85708f30c5d4e5e37ce5b'],
  [MOSS_SEQUENCE, 5, '0eb5c8bbb44fa43e3052d8c4c6b6f781173fa8d660584c84df1766b28293e039'],
  [SESSIONS_SEQUENCE, 1, '83a62e0217940bfe62136052c18f730947355d20e481d9aceb76463251b33700'],
];

describe('baselines — applied migrations are history', () => {
  it.each(PINNED.map(([sequence, n, checksum]) => [`${sequence.id}/${n}`, sequence, n, checksum] as const))(
    '%s is unchanged',
    async (_ref, sequence, n, checksum) => {
      const migration = sequence.migrations[n - 1];
      expect(migration).toBeDefined();
      if (migration !== undefined) expect(await checksumOf(migration)).toBe(checksum);
    },
  );
});

describe('boot — every owner through one ledger', () => {
  // `reader` grants a wildcard over the data, which reaches moss's own tables as it reaches the app's.
  // `everything` grants every verb on the two tables of what was saved, as an app's charter may.
  const app = { charter: { reader: { data: ['*.read'] }, everything: { data: ['artifacts.*', 'artifact_saves.*'] } }, actions: {} };
  const quietly = <T>(run: () => Promise<T>): Promise<T> => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    return run().finally(() => warn.mockRestore());
  };

  it('a fresh database is migrated once and recorded; the next boot finds nothing to do', async () => {
    const pool = createPglitePool(freshDatabase());
    const booted = await quietly(() => createServer(app, { pool, db: pool, session: 'sessions' }));
    const ledger = await readLedger(pool);
    expect(ledger.map((r) => `${r.sequence}/${r.n}`)).toEqual(['nisc.moss/1', 'nisc.moss/2', 'nisc.moss/3', 'nisc.moss/4', 'nisc.moss/5', 'nisc.moss.sessions/1', 'nisc.vex.cache/1', 'nisc.vex.cache/2']);

    await quietly(() => createServer(app, { pool, db: pool, session: 'sessions', migrations: 'verify' }));
    expect((await readLedger(pool)).length).toBe(8);

    // What a charter grants of the two tables of what was saved is kept to the caller's own rows, as moss's
    // own reads and writes of them are. A table with no such rule is granted whole.
    const reached = booted.policyForRoles(['reader']).entities;
    expect(reached['artifacts']).toEqual({ read: [{ match: 'principal', to: 'userId' }] });
    expect(reached['artifact_saves']).toEqual({ read: [{ match: 'principal', to: 'userId' }] });
    expect(reached['integrations']).toEqual({ read: [] });

    // The artifactory's rows, on the tables that boot made. Here, because this database is already up.
    // Its entries name no principal: whose a row is, is vex's to keep, from the `userId` of who they are replayed for.
    const replay = await createOwnEntries({ adapter: createPostgresAdapter({ pool }), db: pool, engine: { invalidate: () => undefined } })({
      owner: 'the artifactory',
      entries: SAVE_ENTRIES,
      tables: ['artifacts', 'artifact_saves'],
      rules: SAVE_ROW_RULES,
    });
    const rowsOf = savedRowsOver(replay, await createGrammarUpgrader({}));
    const rowsAs = rowsOf.of;
    const [ada, ben, cy] = [rowsAs({ userId: 'ada' }), rowsAs({ userId: 'ben' }), rowsAs({ userId: 'cy' })];
    const layout = (text: string): unknown => ({ ref: 'action/home', layout: { component: 'Text', children: text } });
    const save = async (as: typeof ada, versions: { id: string; body: unknown; copiedFrom?: string }[]): Promise<string> => {
      const id = randomUUID();
      await as.write({ id, versions: versions.map((version) => ({ kind: 'layout', copiedFrom: null, ...version })) });
      return id;
    };
    const first = await save(ada, [{ id: 'one', body: layout('one, first') }]);
    const second = await save(ada, [
      { id: 'one', body: layout('one, second'), copiedFrom: first },
      { id: 'two', body: layout('two') },
    ]);
    const reset = await save(ada, [{ id: 'two', body: null }]);
    // The same id as one of ada's: an id is its holder's, and is nobody else's row.
    const bens = await save(ben, [{ id: 'one', body: layout('ben’s') }]);

    const stored = async (table: string, columns: string): Promise<unknown[]> => (await pool.query(`SELECT DISTINCT ${columns} FROM ${table} ORDER BY 1`)).rows;
    expect(await stored('artifacts', 'principal')).toEqual([{ principal: 'ada' }, { principal: 'ben' }]);
    expect(await stored('artifact_saves', 'principal, created_by')).toEqual([{ principal: 'ada', created_by: 'ada' }, { principal: 'ben', created_by: 'ben' }]);

    expect((await ada.inForce()).map((version) => [version.id, version.save, version.body, version.copiedFrom])).toEqual([
      ['one', second, layout('one, second'), first],
      ['two', reset, null, null],
    ]);
    expect((await ben.inForce()).map((version) => [version.id, version.save, version.body])).toEqual([['one', bens, layout('ben’s')]]);
    expect(await cy.inForce()).toEqual([]);
    expect((await ada.history('layout', 'one')).map((version) => version.save)).toEqual([second, first]);
    expect((await ada.history('layout', 'one', first)).map((version) => version.body)).toEqual([layout('one, first')]);
    expect(await ben.history('layout', 'one', first)).toEqual([]);
    expect(await ben.history('layout', 'two')).toEqual([]);
    expect((await ada.inForce())[0]?.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // With no `userId` there is nobody whose rows these are: vex refuses the read and the write. With one
    // that is null, as an app's `scope` could answer, the database refuses the row: none is nobody's.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(rowsAs({}).inForce()).rejects.toThrow(/"artifactory\/in-force" was refused/);
    await expect(save(rowsAs({}), [{ id: 'nobodys', body: layout('nobody’s') }])).rejects.toThrow(/"artifactory\/save" was refused/);
    await expect(save(rowsAs({ userId: null }), [{ id: 'nobodys', body: layout('nobody’s') }])).rejects.toThrow(/"artifactory\/save" was refused/);
    quiet.mockRestore();
    expect((await pool.query('SELECT count(*)::int AS n FROM artifact_saves WHERE principal IS NULL')).rows).toEqual([{ n: 0 }]);
    expect(await stored('artifacts', 'principal')).toEqual([{ principal: 'ada' }, { principal: 'ben' }]);

    // What is published for everybody is the rows of one principal no caller is, made by whoever published.
    // The same entries and the same rule keep them: a caller's read does not reach them, and theirs does not
    // reach a caller's.
    const published = await save(rowsOf.published('pat'), [{ id: 'a-default', body: layout('as published') }]);
    expect((await pool.query('SELECT principal, created_by FROM artifact_saves WHERE id = $1', [published])).rows).toEqual([{ principal: '*', created_by: 'pat' }]);
    expect((await pool.query('SELECT principal FROM artifacts WHERE save = $1', [published])).rows).toEqual([{ principal: '*' }]);
    expect((await rowsOf.published().inForce()).map((version) => [version.id, version.save, version.body])).toEqual([['a-default', published, layout('as published')]]);
    expect((await ada.inForce()).map((version) => version.id)).toEqual(['one', 'two']);
    expect(await ada.history('layout', 'a-default')).toEqual([]);
    expect(() => rowsAs({ userId: '*' })).toThrow(/^moss: a caller’s `userId` is "\*"/);
    const hushed = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Read without a publisher, as a process reads them when it boots, they are not written.
    await expect(save(rowsOf.published(), [{ id: 'nobody-published', body: layout('nobody published') }])).rejects.toThrow(/"artifactory\/save" was refused/);
    hushed.mockRestore();
    expect((await pool.query("SELECT count(*)::int AS n FROM artifacts WHERE principal = '*'")).rows).toEqual([{ n: 1 }]);

    // What an app could do with every verb granted on the two tables, through entries of its own: each of
    // the ways one caller could write a row that is not theirs, or reach one that is another's.
    const plantSave: SeedMutation = {
      fingerprint: 'app/plant-save',
      mutation: { op: 'insert', table: 'artifact_saves', values: { id: { $context: 'save' }, principal: { $context: 'whose' }, created_by: { $context: 'whose' } } },
    };
    const plant: SeedMutation = {
      fingerprint: 'app/plant',
      mutation: { op: 'insert', table: 'artifacts', values: { save: { $context: 'save' }, kind: 'layout', id: { $context: 'id' }, principal: { $context: 'whose' }, body: null } },
    };
    const handOver: SeedMutation = {
      fingerprint: 'app/hand-over',
      mutation: { op: 'update', table: 'artifacts', set: { principal: { $context: 'whose' } }, where: { eq: ['artifacts.save', { $context: 'save' }] } },
    };
    const blank: SeedMutation = { fingerprint: 'app/blank', mutation: { op: 'update', table: 'artifacts', set: { body: null }, where: { eq: ['artifacts.save', { $context: 'save' }] } } };
    const remove: SeedMutation = { fingerprint: 'app/remove', mutation: { op: 'delete', table: 'artifacts', where: { eq: ['artifacts.save', { $context: 'save' }] } } };
    const cache = createMemoryCache();
    await seedCache(cache, [plantSave, plant, handOver, blank, remove]);
    const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool }), cache });
    await engine.introspect();
    const granted = booted.policyForRoles(['everything']);
    const asAda = async (fingerprint: string, context: Record<string, unknown>): Promise<number> =>
      (await handleQuery({ engine, locked: true, scopePolicy: granted, mutations: { client: pool, policy: granted } }, { fingerprint, context }, { userId: 'ada' })).status;
    const whose = async (save: string): Promise<unknown[]> => (await pool.query('SELECT principal, body FROM artifacts WHERE save = $1', [save])).rows;

    // A save is moss's to make: who made one is written from a scope value no caller's scope carries, so
    // an app's entry that inserts one is refused, for another and for everybody alike.
    const planted = randomUUID();
    for (const whoseItIs of ['ben', '*', 'ada']) expect(await asAda('app/plant-save', { save: planted, whose: whoseItIs })).toBe(500);
    expect((await pool.query('SELECT 1 FROM artifact_saves WHERE id = $1', [planted])).rows).toEqual([]);

    // A version an app's entry adds to a save of the caller's is the caller's, whoever it names.
    for (const whoseItIs of ['ben', '*']) expect(await asAda('app/plant', { save: reset, id: `planted-for-${whoseItIs}`, whose: whoseItIs })).toBe(200);
    expect((await whose(reset)).map((row) => Reflect.get(Object(row), 'principal'))).toEqual(['ada', 'ada', 'ada']);
    expect((await pool.query("SELECT count(*)::int AS n FROM artifacts WHERE principal = '*'")).rows).toEqual([{ n: 1 }]);

    expect(await asAda('app/hand-over', { save: second, whose: 'ben' })).toBe(200);
    expect((await whose(second)).map((row) => Reflect.get(Object(row), 'principal'))).toEqual(['ada', 'ada']);
    expect(await ben.history('layout', 'two')).toEqual([]);

    expect(await asAda('app/blank', { save: bens })).toBe(200);
    expect(await whose(bens)).toEqual([{ principal: 'ben', body: layout('ben’s') }]);
    expect(await asAda('app/remove', { save: bens })).toBe(200);
    expect(await whose(bens)).toHaveLength(1);

    // Its own rows a caller may remove where an app's charter grants the verb and the app ships the entry:
    // moss removes none.
    expect(await asAda('app/remove', { save: reset })).toBe(200);
    expect(await whose(reset)).toEqual([]);
    expect(await asAda('app/remove', { save: published })).toBe(200);
    expect(await asAda('app/blank', { save: published })).toBe(200);
    expect(await asAda('app/hand-over', { save: published, whose: 'ada' })).toBe(200);
    expect(await whose(published)).toEqual([{ principal: '*', body: layout('as published') }]);

    // More in force than one read answers: the rest is asked for after the last of the page before.
    await save(cy, Array.from({ length: 501 }, (_, n) => ({ id: `layout-${String(n).padStart(3, '0')}`, body: layout(`number ${n}`) })));
    const many = await cy.inForce();
    expect(many).toHaveLength(501);
    expect(new Set(many.map((version) => version.id)).size).toBe(501);
  });

  it("migrations: 'verify' refuses a database nobody migrated — and creates nothing", async () => {
    const pool = createPglitePool(freshDatabase());
    const error = await quietly(() => createServer(app, { pool, db: pool, session: 'dev-open', migrations: 'verify' })).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'PENDING' });
    expect(String(error)).toContain('nisc.moss/1');
    const { rows } = await pool.query(`SELECT to_regclass('integrations') IS NULL AS absent`);
    expect(rows[0]?.['absent']).toBe(true);
  });

  it('a deployment from before the ledger converges: an older integrations table gains its later columns, rows kept', async () => {
    const pool = createPglitePool(freshDatabase());
    await pool.query(`CREATE TABLE integrations (id text PRIMARY KEY, url text NOT NULL, key_hash text, status text NOT NULL DEFAULT 'pending')`);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('acme', 'https://acme.example')`);
    await quietly(() => createServer(app, { pool, db: pool, session: 'dev-open' }));
    const { rows } = await pool.query(`SELECT id, reach, phrasebook, extension FROM integrations`);
    expect(rows).toEqual([{ id: 'acme', reach: [], phrasebook: {}, extension: null }]);
  });
});
