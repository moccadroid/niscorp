import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import { memoKey } from '../src/identity';
import type { TelemetrySpan } from '../src/runtime';
import { dataOver } from '../src/data/data';
import { createGrammarUpgrader } from '../src/data/grammar';
import { engineDouble } from './data-double';

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

const world = async (telemetry?: { emit: (span: TelemetrySpan) => void }) => {
  const double = await engineDouble();
  const data = dataOver(
    { engine: double.engine, adapter: double.adapter, grants: scopeGrants(['notes', 'tags']), grammars: await createGrammarUpgrader({}) },
    { db: double.db, charter, ...(telemetry !== undefined ? { telemetry } : {}) },
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
  return { ...double, data, post, server };
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

  it('tells each subscriber of a write the routes served, in the order they subscribed, with its chain position', async () => {
    const { data, post } = await world();
    const heard: string[] = [];
    data.onWrite((event, chain) => heard.push(`first ${event.fingerprint} ${event.writes[0]?.table ?? ''} ${chain?.cause ?? 'no chain'}`));
    const stop = data.onWrite((event) => heard.push(`second ${event.fingerprint}`));
    await post('writer', ADD, { 'x-tide-cause': 'f_1', 'x-tide-depth': '0' });
    stop();
    await post('writer', ADD);
    await post('reader', ADD);
    expect(heard).toEqual(['first notes/add notes f_1', 'second notes/add', 'first notes/add notes no chain']);
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
});

// A FEATURE'S OWN ENTRIES (../src/data/own-entries.ts): what a feature reads
// and writes on the tables it keeps. Here the feature keeps `tags`.
const TAGS: SeedEntry = { fingerprint: 'tags/all', dsl: { from: ['tags'], fields: ['tags.id'], limit: 10 } };
const ADD_TAG: SeedMutation = { fingerprint: 'tags/add', mutation: { op: 'insert', table: 'tags', values: { id: { $context: 'id' } } } };
// Authored by the feature, on a table it did not name.
const NOTES_BY_THE_FEATURE: SeedEntry = { fingerprint: 'tags/notes', dsl: { from: ['notes'], fields: ['notes.id'], limit: 10 } };
const ADD_NOTE_BY_THE_FEATURE: SeedMutation = { fingerprint: 'tags/add-note', mutation: { op: 'insert', table: 'notes', values: { body: { $context: 'body' } } } };

describe("the data module — a feature's own entries", () => {
  const own = { entries: [TAGS, ADD_TAG, NOTES_BY_THE_FEATURE, ADD_NOTE_BY_THE_FEATURE], tables: ['tags'] };

  it('are replayed in process, a read and a write, with no role asked for', async () => {
    const { data, written } = await world();
    const replay = await data.ownEntries(own);
    expect(await replay('tags/all', {})).toEqual([{ id: 1, body: 'first' }]);
    expect(await replay('tags/add', { id: 4 })).toEqual({ id: 7, body: 'written' });
    expect(written).toHaveLength(1);
    expect(written[0]?.sql).toMatch(/^INSERT INTO tags/);
    expect(written[0]?.params).toEqual([4]);
  });

  it('are served by no route: whoever holds every grant is told the fingerprint is unknown, and no surface lists it', async () => {
    const { data, server, written, read } = await world();
    await data.ownEntries(own);
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

  it('reach the tables the feature named and no other', async () => {
    const { data, written, read } = await world();
    const replay = await data.ownEntries(own);
    await expect(replay('tags/notes', {})).rejects.toThrow(/^moss: the entry "tags\/notes" was refused \(\d+\): .*notes/);
    await expect(replay('tags/add-note', { body: 'hello' })).rejects.toThrow(/"tags\/add-note" was refused/);
    expect(read).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('replay only what the feature handed over: an entry of the app is unknown to it', async () => {
    const { data } = await world();
    const replay = await data.ownEntries(own);
    await expect(replay('notes/all', {})).rejects.toThrow(/"notes\/all" was refused \(404\)/);
  });

  it("a write of theirs tells the app's engine which tables changed, and is told to no subscriber of the routes", async () => {
    const { data, engine } = await world();
    const invalidated = vi.spyOn(engine, 'invalidate');
    const heard: string[] = [];
    data.onWrite((event) => heard.push(event.fingerprint));
    const replay = await data.ownEntries(own);
    await replay('tags/add', { id: 4 });
    expect(invalidated.mock.calls).toEqual([[['tags']]]);
    expect(heard).toEqual([]);
  });

  it('emits a span for each execution, as machinery does', async () => {
    const spans: TelemetrySpan[] = [];
    const { data } = await world({ emit: (span) => spans.push(span) });
    const replay = await data.ownEntries(own);
    await replay('tags/all', {});
    expect(spans.map((span) => [span.name, span.status, span.attributes['fingerprint'], span.attributes['hasPrincipal']])).toEqual([['vex.execute', 'ok', 'tags/all', false]]);
  });
});
