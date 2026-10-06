import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { vex } from '../../src/adapters/hono/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseAdapter, CompiledQuery, BoundParams, Row } from '../../src/adapters/adapter.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ResolvedQuery } from '../../src/engine/engine.types.js';

const TEST_SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'users',
      table: 'users',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'users_pkey', fields: ['id'], unique: true, type: 'btree' }],
      rowCount: 10,
    },
    {
      name: 'posts',
      table: 'posts',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'uuid', nullable: false, primaryKey: true },
        { name: 'title', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'user_id', type: 'uuid', normalizedType: 'uuid', nullable: false, primaryKey: false },
      ],
      relations: [
        { type: 'belongsTo', entity: 'users', localFields: ['user_id'], foreignFields: ['id'] },
      ],
      indexes: [{ name: 'posts_pkey', fields: ['id'], unique: true, type: 'btree' }],
    },
  ],
};

const createMockAdapter = (): DatabaseAdapter => ({
  id: 'mock',
  introspect: async () => TEST_SCHEMA,
  compile: (_r: ResolvedQuery): CompiledQuery => ({
    sql: 'SELECT 1',
    paramSlots: [],
    contextContract: {},
  }),
  execute: async (_q: CompiledQuery, _p: BoundParams): Promise<Row[]> => [
    { id: '1', name: 'Alice' },
  ],
  capabilities: {
    vectorSearch: false, fuzzyMatch: false, jsonFields: false, fullTextSearch: false,
    returningClause: false, cte: false, windowFunctions: false, statementTimeout: false,
  },
});

describe('hono adapter', () => {
  let app: Hono;
  let engine: QueryEngine;

  beforeAll(async () => {
    engine = createQueryEngine({ adapter: createMockAdapter() });
    await engine.introspect();

    app = new Hono();
    app.route('/api/users/vex', vex({ engine, entities: ['users'] }));
    app.route('/api/vex', vex({ engine }));
  });

  describe('GET discovery', () => {
    it('returns discovery for scoped endpoint', async () => {
      const res = await app.request('/api/users/vex');
      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, unknown>;
      expect(body['vex']).toBe('1.0');

      const entities = body['entities'] as Array<{ name: string }>;
      expect(entities).toHaveLength(1);
      expect(entities[0]!.name).toBe('users');
    });

    it('returns all entities for unscoped endpoint', async () => {
      const res = await app.request('/api/vex');
      const body = await res.json() as Record<string, unknown>;
      const entities = body['entities'] as Array<{ name: string }>;
      expect(entities).toHaveLength(2);
    });

    it('includes DSL schema', async () => {
      const res = await app.request('/api/users/vex');
      const body = await res.json() as Record<string, unknown>;
      expect(body['dsl']).toBeDefined();
    });

    it('includes query format docs', async () => {
      const res = await app.request('/api/users/vex');
      const body = await res.json() as Record<string, unknown>;
      const query = body['query'] as Record<string, unknown>;
      expect(query['method']).toBe('POST');
      expect(query['body']).toHaveProperty('intent');
      expect(query['body']).toHaveProperty('shape');
    });
  });

  describe('POST query', () => {
    it('returns 400 for invalid body', async () => {
      const res = await app.request('/api/users/vex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: true }),
      });
      expect(res.status).toBe(400);
    });

    it('returns error on cache miss without agent', async () => {
      const res = await app.request('/api/users/vex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shape: [{ id: '', name: '' }],
          context: {},
        }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(body['error']).toBeDefined();
    });

    it('replaying an unknown fingerprint is a cache miss', async () => {
      const res = await app.request('/api/users/vex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: 'nope/nothing' }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(body['error']).toBe('cache_miss');
    });
  });

  // A body that is not JSON used to throw out of the route: hono answered 500
  // "Internal Server Error" in plain text for what is the request's mistake.
  describe('a body that is not JSON', () => {
    const notJson = { error: 'invalid_request', message: 'Body must be JSON' };
    const form = (): FormData => {
      const data = new FormData();
      data.append('fingerprint', 'nope/nothing');
      return data;
    };
    const bodies: Array<[string, () => RequestInit]> = [
      ['text', () => ({ headers: { 'Content-Type': 'text/plain' }, body: 'not json' })],
      ['a multipart form', () => ({ body: form() })],
      ['a urlencoded form', () => ({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'fingerprint=nope' })],
      ['truncated JSON', () => ({ headers: { 'Content-Type': 'application/json' }, body: '{"fingerprint":' })],
      ['nothing', () => ({})],
    ];

    for (const method of ['POST', 'PATCH', 'DELETE']) {
      for (const [label, init] of bodies) {
        it(`${method} with ${label} is a 400 invalid_request`, async () => {
          const res = await app.request('/api/vex', { method, ...init() });
          expect(res.status).toBe(400);
          expect(res.headers.get('content-type')).toContain('application/json');
          expect(await res.json()).toEqual(notJson);
        });
      }
    }

    it('is answered the same on a locked endpoint', async () => {
      const lockedApp = new Hono();
      lockedApp.route('/api/vex', vex({ engine, locked: true }));
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const res = await lockedApp.request('/api/vex', { method, headers: { 'Content-Type': 'text/plain' }, body: 'not json' });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(notJson);
      }
    });

    it('never reaches the host error handler, and the execution observer hears nothing', async () => {
      const failures: unknown[] = [];
      const executed: string[] = [];
      let scopeCalls = 0;
      const host = new Hono();
      host.onError((err, c) => {
        failures.push(err);
        return c.text('host', 500);
      });
      host.route(
        '/api/vex',
        vex({
          engine,
          getScope: () => {
            scopeCalls += 1;
            return {};
          },
          onExecute: (record) => void executed.push(record.status),
        }),
      );

      const res = await host.request('/api/vex', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not json' });
      expect(res.status).toBe(400);
      expect(failures).toEqual([]);
      expect(executed).toEqual([]);
      // The scope is still resolved before the body is read, as it was.
      expect(scopeCalls).toBe(1);
    });

    // The body is read through hono's own `req.json()`, as it always was, so a
    // middleware that read it first shares hono's cache with the adapter. Before
    // hono 4.2 that cache was kept per reader: an adapter reading the body any
    // other way answered 500 to a VALID request behind such a middleware. The
    // hono installed here shares its cache either way, so this holds the reader
    // itself: `req.text()` is not the adapter's to call.
    it('a body a host middleware read through hono first is still read', async () => {
      const host = new Hono();
      host.use('*', async (c, next) => {
        await c.req.json().catch(() => undefined);
        c.req.text = () => Promise.reject(new Error('the adapter read the body as text'));
        await next();
      });
      host.route('/api/vex', vex({ engine }));

      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const good = await host.request('/api/vex', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint: 'nope/nothing' }),
        });
        expect(good.status).toBe(404);
        const bad = await host.request('/api/vex', { method, headers: { 'Content-Type': 'text/plain' }, body: 'not json' });
        expect(bad.status).toBe(400);
        expect(await bad.json()).toEqual(notJson);
      }
    });

    // The content type is never read — `fetch` sends a string body as text/plain.
    it('JSON sent as text/plain, or with no content type, is still read', async () => {
      for (const headers of [{ 'Content-Type': 'text/plain' }, undefined]) {
        const res = await app.request('/api/vex', {
          method: 'POST',
          ...(headers !== undefined ? { headers } : {}),
          body: JSON.stringify({ fingerprint: 'nope/nothing' }),
        });
        expect(res.status).toBe(404);
        const body = await res.json() as Record<string, unknown>;
        expect(body['error']).toBe('cache_miss');
      }
    });

    // Only the parse is caught: a body that cannot be READ is the host's fault,
    // and still reaches the host as one.
    it('a body the host already consumed is still a fault', async () => {
      const failures: unknown[] = [];
      const host = new Hono();
      host.onError((err, c) => {
        failures.push(err);
        return c.text('host', 500);
      });
      host.use('*', async (c, next) => {
        await c.req.raw.text();
        await next();
      });
      host.route('/api/vex', vex({ engine }));

      const res = await host.request('/api/vex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: 'nope/nothing' }),
      });
      expect(res.status).toBe(500);
      expect(failures).toHaveLength(1);
    });
  });

  describe('scope', () => {
    it('calls getScope with hono context', async () => {
      let scopeCalled = false;

      const scopedApp = new Hono();
      scopedApp.route(
        '/api/users/vex',
        vex({
          engine,
          entities: ['users'],
          getScope: (c) => {
            scopeCalled = true;
            expect(c.req).toBeDefined();
            return { tenantId: 'test' };
          },
        }),
      );

      await scopedApp.request('/api/users/vex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shape: [{ id: '' }], context: {} }),
      });

      expect(scopeCalled).toBe(true);
    });
  });
});
