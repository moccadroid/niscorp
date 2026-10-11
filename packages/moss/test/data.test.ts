import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { compile, execute } from '@niscorp/prism';
import { createMemoryCache, scopeGrants } from '@niscorp/vex';
import type { DatabaseSchema, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import type { Sequence } from '@niscorp/strata';
import type { DocumentStore } from '@niscorp/strata/postgres';
import { memoKey } from '../src/identity';
import type { TelemetrySpan } from '../src/runtime';
import { createDataWith } from '../src/data/data';
import { createGrammarUpgrader } from '../src/data/engine';
import { featureTablesOf } from '../src/data/migrate';
import { tableSequencesOf } from '../src/data/migrate';
import { NOTES_SCHEMA, engineDouble } from './data-double';

// WHAT SOMEBODY MAY READ AND WRITE, as the one object a server builds: the
// part of it that stands over an engine, held here against an engine with no
// database behind it (./data-double.ts). The part that brings a database up
// is held where a server is booted.

const charter: Charter = {
  public: [],
  reader: { data: ['notes.read'] },
  writer: { data: ['notes.read', 'notes.write.insert'] },
  // Every grant the database can carry.
  owner: { data: ['notes.*', 'tags.*'] },
};

type Env = { Variables: { roles: readonly string[] } };

const who = (...roles: string[]) => ({ key: memoKey(roles, undefined), roles });

const world = async (telemetry?: { emit: (span: TelemetrySpan) => void }, governing: Charter = charter) => {
  const double = await engineDouble();
  // The stores whose documents were asked to be brought current: what would
  // have been handed to strata, over the pool.
  const upgraded: DocumentStore[] = [];
  const data = createDataWith(
    {
      engine: double.engine,
      adapter: double.adapter,
      grants: scopeGrants(['notes', 'tags']),
      grammars: await createGrammarUpgrader({}),
      upgradeStore: async (store) => {
        upgraded.push(store);
      },
    },
    // One feature, `tagging`, which named `tags` as its own.
    { db: double.db, charter: governing, featureTables: [{ feature: 'tagging', names: ['tags'], sequences: [] }], ...(telemetry !== undefined ? { telemetry } : {}) },
  );
  const server = new Hono<Env>();
  // The server's part: who this request is. A header stands in for a session.
  server.use('*', async (c, next) => {
    c.set('roles', [c.req.header('x-test-role') ?? 'public']);
    return next();
  });
  server.route('/', data.routes<Env>({ resources: { notes: ['notes'] }, scope: (c) => ({ userId: c.get('roles').join('+') }), caller: (c) => who(...c.get('roles')) }));
  const post = async (role: string, body: unknown, headers: Record<string, string> = {}): Promise<unknown> => {
    const response = await server.request('/api/notes/vex', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role, ...headers }, body: JSON.stringify(body) });
    return response.json();
  };
  return { ...double, data, post, server, upgraded };
};

const READ = { fingerprint: 'notes/all', context: {} };
const ADD = { fingerprint: 'notes/add', context: { body: 'hello' } };

describe('the data module, over an engine', () => {
  it('serves a request under the policy of the roles the server says it has, compiled from the charter', async () => {
    const { post } = await world();
    expect(await post('reader', READ)).toMatchObject({ result: [{ id: 1, body: 'first' }] });
    expect(await post('public', READ)).toMatchObject({ error: 'scope_denied' });
    expect(await post('reader', ADD)).toMatchObject({ error: 'scope_denied' });
    expect(await post('writer', ADD)).toMatchObject({ result: { id: 7, body: 'written' } });
  });

  it('keeps the policy of a set of roles, and gives the server the one its routes use', async () => {
    const { data } = await world();
    const kept = data.policyOf(who('reader'));
    expect(data.policyOf(who('reader'))).toBe(kept);
    expect(kept.entities['notes']).toMatchObject({ read: [] });
  });

  it('answers what a set of roles may read and write, as a copy that is the caller\'s own', async () => {
    const { data, post } = await world();
    const asked = data.policyForRoles(['writer']);
    expect(asked).toEqual(data.policyOf(who('writer')));
    expect(asked.entities['notes']).toMatchObject({ read: [], insert: [] });
    expect(data.policyForRoles(['public']).entities).toEqual({});
    // Several roles are a union: what either may do.
    expect(data.policyForRoles(['public', 'reader'])).toEqual(data.policyOf(who('reader')));
    // Emptying the answer takes nothing from the writer the routes serve.
    asked.entities = {};
    expect(await post('writer', ADD)).toMatchObject({ result: { id: 7, body: 'written' } });
  });

  it('drops what it compiled when the manifest says it changed, and at no other time', async () => {
    const { data } = await world();
    const listeners: (() => void)[] = [];
    data.dropOnChange((listener) => {
      listeners.push(listener);
      return () => undefined;
    });
    expect(listeners).toHaveLength(1);
    const before = data.policyOf(who('reader'));
    expect(data.policyOf(who('reader'))).toBe(before);
    listeners[0]?.();
    const after = data.policyOf(who('reader'));
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
  });

  it('tells each subscriber of a write the routes served, in the order they subscribed, with what its request said', async () => {
    const { data, post } = await world();
    const heard: string[] = [];
    data.onWrite((event, request) => heard.push(`first ${event.fingerprint} ${event.writes[0]?.table ?? ''} ${request.header('x-said') ?? 'nothing said'}`));
    const stop = data.onWrite((event) => heard.push(`second ${event.fingerprint}`));
    await post('writer', ADD, { 'x-said': 'f_1' });
    stop();
    await post('writer', ADD);
    await post('reader', ADD);
    expect(heard).toEqual(['first notes/add notes f_1', 'second notes/add', 'first notes/add notes nothing said']);
  });

  // A role machinery runs as is a set of roles like any other, and its policy
  // is a function of the charter: compiled once and kept, because identity
  // resolution runs several entries for each sign-in.
  it('a role machinery runs as has its policy compiled once, and kept until the manifest changes', async () => {
    // How often the charter is asked for the role: every compilation reads it.
    let read = 0;
    const counted: Charter = Object.defineProperty({ ...charter }, 'reader', {
      enumerable: true,
      get: () => {
        read += 1;
        return charter['reader'];
      },
    });
    const { data } = await world(undefined, counted);
    const listeners: (() => void)[] = [];
    data.dropOnChange((listener) => {
      listeners.push(listener);
      return () => undefined;
    });

    expect(await data.executeAs('reader', 'notes/all', {})).toEqual([{ id: 1, body: 'first' }]);
    const once = read;
    expect(once).toBeGreaterThan(0);
    await data.executeAs('reader', 'notes/all', {});
    await data.executeAs('reader', 'notes/all', {});
    expect(read).toBe(once);
    // and it is the one a request by somebody holding exactly that role is served under
    data.policyOf(who('reader'));
    expect(read).toBe(once);

    listeners[0]?.();
    await data.executeAs('reader', 'notes/all', {});
    expect(read).toBe(once * 2);
  });

  it('runs a seeded entry as a charter role, under that role\'s grants', async () => {
    const { data, written } = await world();
    expect(await data.executeAs('reader', 'notes/all', {})).toEqual([{ id: 1, body: 'first' }]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await data.executeAs('public', 'notes/all', {})).toBeUndefined();
      expect(await data.executeAs('reader', 'notes/add', { body: 'hello' })).toBeUndefined();
    } finally {
      error.mockRestore();
    }
    expect(written).toHaveLength(0);
    expect(await data.executeAs('writer', 'notes/add', { body: 'hello' })).toEqual({ id: 7, body: 'written' });
  });

  it('a write machinery makes is not told to the subscribers of the routes', async () => {
    const { data } = await world();
    const heard: string[] = [];
    data.onWrite((event) => heard.push(event.fingerprint));
    await data.executeAs('writer', 'notes/add', { body: 'hello' });
    expect(heard).toEqual([]);
  });

  it('emits one span for each execution, on the routes and for machinery, to the sink it was handed', async () => {
    const spans: TelemetrySpan[] = [];
    const { data, post } = await world({ emit: (span) => spans.push(span) });
    await post('reader', READ);
    await data.executeAs('reader', 'notes/all', {});
    expect(spans.map((span) => [span.name, span.status, span.attributes['fingerprint'], span.attributes['hasPrincipal']])).toEqual([
      ['vex.execute', 'ok', 'notes/all', true],
      ['vex.execute', 'ok', 'notes/all', false],
    ]);
  });
  it('answers an intent with a query written under the policy of whoever it is asked for', async () => {
    const { data } = await world();
    const shown: string[][] = [];
    const writers = {
      generateDsl: async (_request: unknown, schema: { entities: { name: string }[] }) => {
        shown.push(schema.entities.map((entity) => entity.name));
        return { from: ['notes'], fields: ['notes.id', 'notes.body'] };
      },
      mapToShape: async (rows: Record<string, unknown>[]) => {
        const ir = await compile({ $ref: '$.result' });
        return { ir, transformed: execute(ir, { result: JSON.parse(JSON.stringify(rows)) }) };
      },
    };
    const asked = { intent: 'every note', shape: [{ id: 0, body: '' }] };
    const answered = await data.answerIntent(writers, asked, who('reader'), { userId: 'usr_1' });
    expect(answered.result).toEqual([{ id: 1, body: 'first' }]);
    // The owner's writer is shown both tables, the reader's only what a reader reads.
    await data.answerIntent(writers, asked, who('owner'), { userId: 'usr_2' });
    expect(shown).toEqual([['notes'], ['notes', 'tags']]);
    // Somebody the charter grants nothing: the writer is shown no table, and
    // what it writes all the same is refused.
    await expect(data.answerIntent(writers, asked, who('public'), {})).rejects.toThrow();
    expect(shown[2]).toEqual([]);
  });
});

// A FEATURE'S OWN ENTRIES (../src/data/own-entries.ts): what a feature reads
// and writes on the tables it keeps. Here the feature keeps `tags`.
const TAGS: SeedEntry = { fingerprint: 'tags/all', dsl: { from: ['tags'], fields: ['tags.id'], limit: 10 } };
const ADD_TAG: SeedMutation = { fingerprint: 'tags/add', mutation: { op: 'insert', table: 'tags', values: { id: { $context: 'id' } } } };
// Authored by the feature, on a table it did not name.
const NOTES_BY_THE_FEATURE: SeedEntry = { fingerprint: 'tags/notes', dsl: { from: ['notes'], fields: ['notes.id'], limit: 10 } };
const ADD_NOTE_BY_THE_FEATURE: SeedMutation = { fingerprint: 'tags/add-note', mutation: { op: 'insert', table: 'notes', values: { body: { $context: 'body' } } } };

describe("the data module — a feature's own entries", () => {
  const own = [TAGS, ADD_TAG];

  it('are replayed in process, a read and a write, with no role asked for', async () => {
    const { data, written } = await world();
    const replay = await data.ownEntries('tagging', own);
    expect(await replay('tags/all', {})).toEqual([{ id: 1, body: 'first' }]);
    expect(await replay('tags/add', { id: 4 })).toEqual({ id: 7, body: 'written' });
    expect(written).toHaveLength(1);
    expect(written[0]?.sql).toMatch(/^INSERT INTO tags/);
    expect(written[0]?.params).toEqual([4]);
  });

  it('are served by no route: whoever holds every grant is told the fingerprint is unknown, and no surface lists it', async () => {
    const { data, server, written, read } = await world();
    await data.ownEntries('tagging', own);
    const asOwner = { 'content-type': 'application/json', 'x-test-role': 'owner' };
    for (const path of ['/api/vex', '/api/notes/vex']) {
      for (const fingerprint of ['tags/all', 'tags/add']) {
        const response = await server.request(path, { method: 'POST', headers: asOwner, body: JSON.stringify({ fingerprint, context: { id: 4 } }) });
        expect([path, fingerprint, response.status]).toEqual([path, fingerprint, 404]);
        expect(await response.json()).toMatchObject({ error: 'cache_miss' });
      }
      const listed: unknown = await (await server.request(path, { headers: asOwner })).json();
      expect(listed).toMatchObject({ fingerprints: expect.any(Array) });
      expect(JSON.stringify(listed)).toContain('notes/all');
      expect(JSON.stringify(listed)).not.toContain('tags/');
    }
    // The owner does hold the grants: the app's own entries answer them.
    expect(await (await server.request('/api/vex', { method: 'POST', headers: asOwner, body: JSON.stringify(ADD) })).json()).toMatchObject({ result: { id: 7 } });
    expect(written).toHaveLength(1);
    expect(read).toHaveLength(0);
  });

  // WHICH TABLES IS NOT THE ASKER'S TO SAY. The tables are the ones the feature
  // named on itself, and an entry over any other is refused when it is handed
  // over, a read and a write alike: a list taken from the asker would let any
  // feature read `sessions` by naming it.
  it('reach the tables the feature named as its own and no other: an entry over another table is refused when it is handed over', async () => {
    const { data, written, read } = await world();
    await expect(data.ownEntries('tagging', [TAGS, NOTES_BY_THE_FEATURE])).rejects.toThrow(
      /^moss: the feature "tagging" handed over an entry that reads or writes a table that is not its own: "tags\/notes"\. Its own entries run outside the app's policy, so they reach the tables that are its own \(tags\) and no other\./,
    );
    await expect(data.ownEntries('tagging', [ADD_NOTE_BY_THE_FEATURE, NOTES_BY_THE_FEATURE])).rejects.toThrow(/handed over entries that read or write a table that is not its own: "tags\/add-note", "tags\/notes"/);
    expect(read).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('a feature the data module was never told of has no tables to ask for', async () => {
    const { data } = await world();
    await expect(data.ownEntries('somebody-else', [TAGS])).rejects.toThrow(/was asked for the tables of a feature it was never told of \("somebody-else"\)/);
  });

  it('replay only what the feature handed over: an entry of the app is unknown to it', async () => {
    const { data } = await world();
    const replay = await data.ownEntries('tagging', own);
    await expect(replay('notes/all', {})).rejects.toThrow(/"notes\/all" was refused \(404\)/);
  });

  it("a write of theirs tells the app's engine which tables changed, and is told to no subscriber of the routes", async () => {
    const { data, engine } = await world();
    const invalidated = vi.spyOn(engine, 'invalidate');
    const heard: string[] = [];
    data.onWrite((event) => heard.push(event.fingerprint));
    const replay = await data.ownEntries('tagging', own);
    await replay('tags/add', { id: 4 });
    expect(invalidated.mock.calls).toEqual([[['tags']]]);
    expect(heard).toEqual([]);
  });

  it('emits a span for each execution, as machinery does', async () => {
    const spans: TelemetrySpan[] = [];
    const { data } = await world({ emit: (span) => spans.push(span) });
    const replay = await data.ownEntries('tagging', own);
    await replay('tags/all', {});
    expect(spans.map((span) => [span.name, span.status, span.attributes['fingerprint'], span.attributes['hasPrincipal']])).toEqual([['vex.execute', 'ok', 'tags/all', false]]);
  });
});

// THE LIST OF TABLES AN APP GIVES VEX (`runtime.vexConfig.entities`) IS ABOUT
// THE APP'S ENGINE ONLY. It cuts that engine's schema down to the list, which
// leaves moss's tables out, so moss's own entries (the generation pointer, a
// feature's own) run on engines that read their owner's tables off the
// database itself.
describe("the data module — moss's own entries, where the app gave vex a list of tables", () => {
  const generation: DatabaseSchema['entities'][number] = {
    name: 'moss_generation',
    table: 'moss_generation',
    fields: [
      { name: 'id', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: true },
      { name: 'n', type: 'bigint', normalizedType: 'number', nullable: false, primaryKey: false },
    ],
    relations: [],
    indexes: [{ name: 'moss_generation_pkey', fields: ['id'], unique: true, type: 'btree' }],
  };

  // The database holds `notes`, `tags` and the pointer's table; the app's
  // list names `notes` alone.
  const listed = async () => {
    const double = await engineDouble([{ n: 3 }], { entities: [...NOTES_SCHEMA.entities, generation] }, ['notes']);
    const data = createDataWith(
      { engine: double.engine, adapter: double.adapter, grants: scopeGrants(['notes']), grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined },
      { db: double.db, charter, featureTables: [{ feature: 'tagging', names: ['tags'], sequences: [] }] },
    );
    return { ...double, data };
  };

  it("the app's engine knows the tables of the list, and no other", async () => {
    const { engine } = await listed();
    expect(engine.getSchema()?.entities.map((entity) => entity.name)).toEqual(['notes']);
  });

  it('the generation pointer is read and moved', async () => {
    const { data, written } = await listed();
    expect(await data.pointer.read()).toBe(3);
    await data.pointer.move(3);
    expect(written[0]?.sql).toMatch(/^UPDATE moss_generation/);
  });

  it("a feature's own entries are taken and replayed on the tables it named", async () => {
    const { data, written, tablesRead } = await listed();
    const replay = await data.ownEntries('tagging', [TAGS, ADD_TAG]);
    await replay('tags/all', {});
    await replay('tags/add', { id: 4 });
    expect(tablesRead).toEqual(['tags']);
    expect(written[0]?.sql).toMatch(/^INSERT INTO tags/);
  });

  it('and reach no other table for it: neither one of the list, nor one the list left out', async () => {
    const { data, read, written } = await listed();
    const POINTER_BY_THE_FEATURE: SeedEntry = { fingerprint: 'tags/pointer', dsl: { from: ['moss_generation'], fields: ['moss_generation.n'], limit: 1 } };
    await expect(data.ownEntries('tagging', [TAGS, NOTES_BY_THE_FEATURE])).rejects.toThrow(/handed over an entry that reads or writes a table that is not its own: "tags\/notes"/);
    await expect(data.ownEntries('tagging', [TAGS, POINTER_BY_THE_FEATURE])).rejects.toThrow(/handed over an entry that reads or writes a table that is not its own: "tags\/pointer"/);
    expect(read).toHaveLength(0);
    expect(written).toHaveLength(0);
  });
});

// THE DOCUMENTS A FEATURE KEEPS IN ITS ROWS are brought to this code's
// grammars when the feature asks, and only in a table that is its own.
describe("the data module — the documents stored in a feature's table", () => {
  const store = (table: string): DocumentStore => ({ table, column: 'definition', stamp: 'grammar', kind: 'nisc.nova/action', key: ['id'] });

  it('are upgraded when the feature that keeps the table asks', async () => {
    const { data, upgraded } = await world();
    await data.upgradeStore('tagging', store('tags'));
    expect(upgraded).toEqual([store('tags')]);
  });

  it("are not touched in a table that is not the feature's own: the asking is refused, with the table", async () => {
    const { data, upgraded } = await world();
    await expect(data.upgradeStore('tagging', store('notes'))).rejects.toThrow(
      /^moss: the feature "tagging" asked for the documents stored in "notes" to be upgraded, and that table is not its own \(its own: tags\)\./,
    );
    await expect(data.upgradeStore('tagging', { ...store('tags'), schema: 'other' })).rejects.toThrow(/a store is named by its table alone/);
    await expect(data.upgradeStore('somebody-else', store('tags'))).rejects.toThrow(/never told of \("somebody-else"\)/);
    expect(upgraded).toEqual([]);
  });
});

describe('the data module — the fingerprints somebody may be told of', () => {
  // The engine holds a read of `notes`, the same read at a reach, and a write
  // that inserts a note (./data-double.ts).
  it('are the entries their own policy lets them replay: a read by the tables it reads, a write by what it writes', async () => {
    const { data } = await world();
    expect(await data.fingerprintsFor(who('public'))).toEqual([]);
    expect(await data.fingerprintsFor(who('reader'))).toEqual(['notes/all', 'notes/mine']);
    expect(await data.fingerprintsFor(who('writer'))).toEqual(['notes/add', 'notes/all', 'notes/mine']);
    // Several roles are a union, as they are when an entry is replayed.
    expect(await data.fingerprintsFor(who('public', 'writer'))).toEqual(['notes/add', 'notes/all', 'notes/mine']);
  });

  // EVERY FINGERPRINT THE APP SERVES is the data module's to answer, so it
  // hands out no engine for the cache's keys.
  it('every fingerprint the app serves is answered by the data module, which hands out no engine', async () => {
    const { data } = await world();
    expect([...(await data.fingerprints())].sort()).toEqual(['notes/add', 'notes/all', 'notes/mine']);
    await data.ownEntries('tagging', [TAGS, ADD_TAG]);
    expect([...(await data.fingerprints())].sort()).toEqual(['notes/add', 'notes/all', 'notes/mine']);
    expect(Object.keys(data)).not.toContain('engine');
  });

  it("are never a feature's own entries, whatever the caller holds", async () => {
    const { data } = await world();
    await data.ownEntries('tagging', [TAGS, ADD_TAG]);
    expect(await data.fingerprintsFor(who('owner'))).toEqual(['notes/add', 'notes/all', 'notes/mine']);
  });

});

// THE APP'S ENTRIES ARE SEEDED WHEN THEY ARE HANDED OVER (`seed`). What the
// routes replay is what whoever holds the entries hands the data module (the
// running manifest, where a server stands), and nothing the data module reads
// off an app. The engine here starts holding three (./data-double.ts).
describe('the data module — the entries the app serves', () => {
  const BODIES: SeedEntry = { fingerprint: 'notes/bodies', dsl: { from: ['notes'], fields: ['notes.body'] } };
  const ASK = { fingerprint: 'notes/bodies', context: {} };

  it('replays an entry once it has been handed over, and not before', async () => {
    const { data, post } = await world();
    expect(await post('reader', ASK)).toMatchObject({ error: 'cache_miss' });
    await data.seed([BODIES]);
    expect(await post('reader', ASK)).toMatchObject({ result: [{ id: 1, body: 'first' }] });
  });

  it('lands each as a protected row, and leaves one that is already there as authored untouched', async () => {
    const { data, engine } = await world();
    await data.seed([BODIES]);
    const landed = await engine.cache.get('notes/bodies');
    expect(landed).toMatchObject({ kind: 'ok', protected: true, dsl: BODIES.dsl });
    await data.seed([BODIES]);
    expect(await engine.cache.get('notes/bodies')).toBe(landed);
  });

  it('refuses a write that fails the authoring lint, naming it', async () => {
    const { data } = await world();
    const unbounded: SeedMutation = { fingerprint: 'notes/clear', mutation: { op: 'delete', table: 'notes', where: {} } } as unknown as SeedMutation;
    await expect(data.seed([unbounded])).rejects.toThrow(/Mutation seed "notes\/clear" fails the authoring lint/);
  });
});

// WHOSE TABLES ONE RUN COVERS (../src/data/migrate.ts). Nothing is run here:
// the pool is never asked, and the cache keeps no table.
describe('the data module — the tables a run covers', () => {
  const sequence = (id: string): Sequence => ({ id, migrations: [{ description: `the tables of ${id}`, steps: [{ kind: 'sql', sql: `CREATE TABLE ${id.replace(/\W/g, '_')} (id text PRIMARY KEY)` }] }] });
  const owners = { pool: { query: async () => ({ rows: [] }) }, cache: createMemoryCache(), storesSessions: false };

  it("a feature's tables are run with the others: after moss's own, before the app's", () => {
    const grants = sequence('feature.grants');
    const notes = sequence('app.notes');
    const features = [{ name: 'one', tables: { names: ['grants'], sequences: [grants] }, start: () => undefined }, { name: 'none', start: () => undefined }];
    expect(featureTablesOf({ features })).toEqual([
      { feature: 'one', names: ['grants'], sequences: [grants] },
      { feature: 'none', names: [], sequences: [] },
    ]);
    expect(tableSequencesOf({ ...owners, featureTables: featureTablesOf({ features }), tables: [notes] }).map((owned) => owned.id)).toEqual(['nisc.moss', 'feature.grants', 'app.notes']);
  });

  it('an app with no feature, or one that keeps no table, adds none', () => {
    expect(featureTablesOf({})).toEqual([]);
    expect(tableSequencesOf({ ...owners, storesSessions: true }).map((owned) => owned.id)).toEqual(['nisc.moss', 'nisc.moss.sessions']);
  });
});

// WHICH TABLES ARE A FEATURE'S OWN (../src/data/migrate.ts), read off
// the features before any of them runs.
describe("the data module — the tables a feature names as its own", () => {
  const naming = (name: string, ...names: string[]) => ({ name, tables: { names }, start: () => undefined });

  it('two features of one name are refused: the name is what a table is kept under', () => {
    expect(() => featureTablesOf({ features: [naming('one', 'grants'), naming('one', 'notes')] })).toThrow(/^moss: two features are named "one"\./);
  });
});
