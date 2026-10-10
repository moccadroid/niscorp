import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createScopePolicy } from '@niscorp/vex';
import type { ExecuteRecord, ScopePolicy, WriteEvent } from '@niscorp/vex';
import { createVexRoutes } from '../src/data/routes';
import { createWriteLane } from '../src/data/writes';
import type { ChainHints } from '../src/data/writes';
import { engineDouble } from './data-double';

// THE VEX SURFACES, mounted the way the server mounts them: a sub-app at the
// root, behind a middleware that says who the request is. The engine has no
// database behind it (./data-double.ts).

type Env = { Variables: { role: string } };

const POLICIES: Readonly<Record<string, ScopePolicy>> = {
  reader: createScopePolicy(new Set(['notes.read', 'tags.read'])),
  writer: createScopePolicy(new Set(['notes.read', 'notes.write.insert'])),
};
const NOTHING = createScopePolicy(new Set());

const world = async (resources: Record<string, readonly string[] | { entities: readonly string[] }> = { notes: ['notes'] }) => {
  const double = await engineDouble();
  const writes = createWriteLane();
  const heard: { event: WriteEvent; chain: ChainHints | undefined }[] = [];
  writes.subscribe((event, chain) => heard.push({ event, chain }));
  const reaches: string[] = [];
  const records: ExecuteRecord[] = [];

  const server = new Hono<Env>();
  // The server's part: who this request is. Here a header stands in for a
  // session, which is exactly what a real request may never do.
  server.use('*', async (c, next) => {
    c.set('role', c.req.header('x-test-role') ?? 'nobody');
    return next();
  });
  server.route(
    '/',
    createVexRoutes<Env>({
      engine: double.engine,
      db: double.db,
      resources,
      scope: (c) => ({ userId: `usr_${c.get('role')}` }),
      policy: (c) => POLICIES[c.get('role')] ?? NOTHING,
      policyAtReach: (c, reach) => {
        reaches.push(reach);
        return POLICIES[c.get('role')] ?? NOTHING;
      },
      onExecute: (record) => records.push(record),
      writes,
    }),
  );

  const post = (path: string, role: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
    Promise.resolve(server.request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role, ...headers }, body: JSON.stringify(body) }));
  return { ...double, server, post, heard, reaches, records };
};

// The code vex puts on an answer that is not the rows: `scope_denied`, `locked`.
const errorOf = async (response: Response): Promise<unknown> => {
  const body: unknown = await response.json();
  return body !== null && typeof body === 'object' && 'error' in body ? body.error : undefined;
};

const entitiesOf = async (response: Response): Promise<string[]> => {
  const body: unknown = await response.json();
  if (body === null || typeof body !== 'object' || !('entities' in body) || !Array.isArray(body.entities)) return [];
  return body.entities.map((entity: unknown) => (entity !== null && typeof entity === 'object' && 'name' in entity ? String(entity.name) : ''));
};

describe('the vex surfaces', () => {
  it('replay a seeded read under the policy the caller says this request has', async () => {
    const { post } = await world();
    const granted = await post('/api/vex', 'reader', { fingerprint: 'notes/all', context: {} });
    expect(granted.status).toBe(200);
    expect(await granted.json()).toMatchObject({ result: [{ id: 1, body: 'first' }] });
    const refused = await post('/api/vex', 'nobody', { fingerprint: 'notes/all', context: {} });
    expect(await errorOf(refused)).toBe('scope_denied');
  });

  it('are locked: a query that is not a seeded entry is not run, and no entry is managed', async () => {
    const { post, server, read } = await world();
    const authored = await post('/api/vex', 'reader', { intent: 'every note there is', shape: { notes: [{ body: 'string' }] }, context: {} });
    expect(await errorOf(authored)).toBe('locked');
    expect(read).toHaveLength(0);
    const managed = await server.request('/api/vex', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-test-role': 'reader' },
      body: JSON.stringify({ fingerprint: 'notes/all' }),
    });
    expect(await errorOf(managed)).toBe('locked');
    expect((await post('/api/vex', 'reader', { fingerprint: 'notes/all', context: {} })).status).toBe(200);
  });

  it('serve one surface for each resource, over its entities only', async () => {
    const { server } = await world({ notes: ['notes'], labels: { entities: ['tags'] } });
    const as = { headers: { 'x-test-role': 'reader' } };
    expect(await entitiesOf(await server.request('/api/notes/vex', as))).toEqual(['notes']);
    expect(await entitiesOf(await server.request('/api/labels/vex', as))).toEqual(['tags']);
    expect((await server.request('/api/other/vex', as)).status).toBe(404);
  });

  it('serve an entry that demands a reach at that reach', async () => {
    const { post, reaches } = await world();
    expect((await post('/api/vex', 'reader', { fingerprint: 'notes/mine', context: {} })).status).toBe(200);
    expect(reaches).toEqual(['personal']);
  });

  it('report each execution, with the scope the caller said this request carries', async () => {
    const { post, records } = await world();
    await post('/api/notes/vex', 'reader', { fingerprint: 'notes/all', context: {} });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'query', status: 'ok', fingerprint: 'notes/all', scope: { userId: 'usr_reader' } });
  });

  it('replay a seeded write and report it on the lane, once, with the scope of the request', async () => {
    const { post, written, heard } = await world();
    const response = await post('/api/notes/vex', 'writer', { fingerprint: 'notes/add', context: { body: 'hello' } });
    expect(response.status).toBe(200);
    expect(written).toHaveLength(1);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.event).toMatchObject({
      fingerprint: 'notes/add',
      writes: [{ table: 'notes', op: 'insert', rows: [{ id: 7, body: 'written' }] }],
      scope: { userId: 'usr_writer' },
    });
    expect(heard[0]?.chain).toBeUndefined();
  });

  it('a write that is refused is not reported', async () => {
    const { post, written, heard } = await world();
    expect(await errorOf(await post('/api/vex', 'reader', { fingerprint: 'notes/add', context: { body: 'hello' } }))).toBe('scope_denied');
    expect(written).toHaveLength(0);
    expect(heard).toHaveLength(0);
  });

  it('a write carries the chain position its request named in the two headers', async () => {
    const { post, heard } = await world();
    await post('/api/vex', 'writer', { fingerprint: 'notes/add', context: { body: 'hello' } }, { 'x-tide-cause': 'f_1', 'x-tide-depth': '2' });
    expect(heard[0]?.chain).toEqual({ cause: 'f_1', depth: 2 });
  });

  it('a position that does not read as one is no position', async () => {
    const { post, heard } = await world();
    const add = { fingerprint: 'notes/add', context: { body: 'hello' } };
    await post('/api/vex', 'writer', add, { 'x-tide-depth': '2' });
    await post('/api/vex', 'writer', add, { 'x-tide-cause': '', 'x-tide-depth': '2' });
    await post('/api/vex', 'writer', add, { 'x-tide-cause': 'f_1' });
    await post('/api/vex', 'writer', add, { 'x-tide-cause': 'f_1', 'x-tide-depth': '-1' });
    await post('/api/vex', 'writer', add, { 'x-tide-cause': 'f_1', 'x-tide-depth': '1.5' });
    await post('/api/vex', 'writer', add, { 'x-tide-cause': 'f_1', 'x-tide-depth': 'deep' });
    expect(heard.map((write) => write.chain)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  // The depth was read with `Number()`, which reads more than a number: an
  // empty header is 0, and so is one of spaces. A request that named a cause
  // and an empty depth was then heard at depth 0, the start of a chain: a
  // chain whose depth was lost on the way was counted from the beginning.
  it.each([
    ['empty', ''],
    ['spaces', '  '],
    ['written in hex', '0x2'],
    ['written with an exponent', '1e1'],
    ['signed', '+2'],
    ['more than a whole number can hold', '9'.repeat(30)],
  ])('a depth that is %s is no position', async (_label, depth) => {
    const { post, heard } = await world();
    await post('/api/vex', 'writer', { fingerprint: 'notes/add', context: { body: 'hello' } }, { 'x-tide-cause': 'f_1', 'x-tide-depth': depth });
    expect(heard.map((write) => write.chain)).toEqual([undefined]);
  });

  it('a depth of 0 is a position, written as String(depth) writes it', async () => {
    const { post, heard } = await world();
    await post('/api/vex', 'writer', { fingerprint: 'notes/add', context: { body: 'hello' } }, { 'x-tide-cause': 'f_1', 'x-tide-depth': '0' });
    expect(heard[0]?.chain).toEqual({ cause: 'f_1', depth: 0 });
  });
});
