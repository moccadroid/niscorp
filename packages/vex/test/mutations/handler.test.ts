import { describe, it, expect, vi } from 'vitest';
import { handleQuery, handleDiscovery, handleFingerprintPatch } from '../../src/handler.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { MutationClient } from '../../src/mutations/engine.js';

const field = (name: string, normalizedType = 'string', primaryKey = false) => ({
  name,
  type: normalizedType,
  normalizedType: normalizedType as 'string',
  nullable: !primaryKey,
  primaryKey,
});

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'tasks',
      table: 'tasks',
      fields: [field('id', 'string', true), field('title'), field('done', 'boolean'), field('assignee_id')],
      relations: [],
      indexes: [],
    },
  ],
};

const policy: ScopePolicy = { default: 'deny', entities: { tasks: { write: [{ match: 'assignee_id', to: 'userId' }] } } };

const setDone = { op: 'update' as const, table: 'tasks', set: { done: { $context: 'done' } }, where: { eq: ['tasks.id', { $context: 'id' }] } };

const makeWorld = async () => {
  const cache = createMemoryCache();
  await cache.set('tasks/setDone', { kind: 'mutation', mutation: setDone, intent: 'Flip a task done flag', protected: true, createdAt: 1 });
  await cache.set('tasks/list', { kind: 'ok', dsl: { from: ['tasks'], fields: ['tasks.id'] } as never, shape: [{ id: '' }], intent: 'List tasks', protected: true, createdAt: 1 });
  const execute = vi.fn(async () => ({ result: [], meta: { cache: { hit: true }, context: {} } }));
  const engine = { cache, getSchema: () => schema, execute } as unknown as QueryEngine;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client: MutationClient = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      return { rows: [{ id: 'task_1', done: true }] };
    },
  };
  return { engine, execute, client, calls };
};

describe('unified wire — one shape, kind dispatch', () => {
  it('replays a mutation fingerprint through the write pipeline (engine.execute untouched)', async () => {
    const { engine, execute, client, calls } = await makeWorld();
    const res = await handleQuery({ engine, locked: true, mutations: { client, policy } }, { fingerprint: 'tasks/setDone', context: { id: 'task_1', done: true } }, { userId: 'usr_1' });
    expect(res.status).toBe(200);
    expect((res.body as { result: { id: string } }).result.id).toBe('task_1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/^UPDATE tasks/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('routes a query fingerprint to the read engine', async () => {
    const { engine, execute, client } = await makeWorld();
    const res = await handleQuery({ engine, mutations: { client, policy } }, { fingerprint: 'tasks/list', context: {} }, {});
    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('missing context is a hard 400 carrying the FULL derived signature', async () => {
    const { engine, client, calls } = await makeWorld();
    const res = await handleQuery({ engine, mutations: { client, policy } }, { fingerprint: 'tasks/setDone', context: {} }, { userId: 'u' });
    expect(res.status).toBe(400);
    const body = res.body as { error: string; details: { expected: Record<string, { type: string; column: string }> } };
    expect(body.error).toBe('missing_context');
    expect(body.details.expected['done']).toEqual({ type: 'boolean', column: 'tasks.done' });
    expect(body.details.expected['id']).toEqual({ type: 'string', column: 'tasks.id' });
    expect(calls).toHaveLength(0);
  });

  it('a mutation fingerprint on an endpoint without a mutation client is refused', async () => {
    const { engine } = await makeWorld();
    const res = await handleQuery({ engine }, { fingerprint: 'tasks/setDone', context: { id: 'x', done: true } }, {});
    expect(res.status).toBe(500);
    expect((res.body as { message: string }).message).toContain('no mutation client');
  });
});

describe('discovery — derived contracts for both kinds', () => {
  it('lists mutations with kind, context signature and effect; queries with signature and shape', async () => {
    const { engine } = await makeWorld();
    const disco = await handleDiscovery({ engine });
    const mut = disco.fingerprints.find((f) => f.fingerprint === 'tasks/setDone');
    expect(mut?.kind).toBe('mutation');
    expect(mut?.context?.['done']).toEqual({ type: 'boolean', column: 'tasks.done' });
    expect(mut?.effect).toEqual([{ op: 'update', table: 'tasks', columns: ['done'] }]);
    const qry = disco.fingerprints.find((f) => f.fingerprint === 'tasks/list');
    expect(qry?.kind).toBe('query');
    expect(qry?.shape).toEqual([{ id: '' }]);
    expect(qry?.context).toEqual({});
  });
});

describe('fingerprint management covers mutation entries', () => {
  it('PATCH unprotects a mutation entry when unlocked', async () => {
    const { engine } = await makeWorld();
    const res = await handleFingerprintPatch({ engine }, 'tasks/setDone', { protected: false });
    expect(res.status).toBe(200);
    const entry = await engine.cache.get('tasks/setDone');
    expect(entry?.protected).not.toBe(true);
  });
});
