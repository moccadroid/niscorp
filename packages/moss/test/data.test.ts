import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
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
};

type Env = { Variables: { roles: readonly string[] } };

const who = (...roles: string[]) => ({ key: memoKey(roles, undefined), roles });

const world = async (telemetry?: { emit: (span: TelemetrySpan) => void }) => {
  const double = await engineDouble();
  const data = dataOver(
    { engine: double.engine, grants: scopeGrants(['notes', 'tags']), grammars: await createGrammarUpgrader({}) },
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
  return { ...double, data, post };
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
