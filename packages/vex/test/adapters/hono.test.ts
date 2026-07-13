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
        { type: 'belongsTo', entity: 'users', localField: 'user_id', foreignField: 'id' },
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
