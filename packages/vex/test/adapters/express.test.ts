import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vex } from '../../src/adapters/express/index.js';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { seedCache } from '../../src/cache/seed.js';
import { createScopePolicy } from '../../src/scope/grants.js';
import type { VexExpressRequest, VexExpressResponse } from '../../src/adapters/express/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseAdapter, CompiledQuery, BoundParams, Row } from '../../src/adapters/adapter.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ResolvedQuery } from '../../src/engine/engine.types.js';

const TEST_SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'items',
      table: 'items',
      fields: [
        { name: 'id', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: true },
        { name: 'title', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'items_pkey', fields: ['id'], unique: true, type: 'btree' }],
      rowCount: 5,
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
  execute: async (_q: CompiledQuery, _p: BoundParams): Promise<Row[]> => [{ id: 1, title: 'Test' }],
  capabilities: {
    vectorSearch: false, fuzzyMatch: false, jsonFields: false, fullTextSearch: false,
    returningClause: false, cte: false, windowFunctions: false, statementTimeout: false,
  },
});

type MockResponse = {
  statusCode: number;
  body: unknown;
};

const mockReq = (method: string, body?: unknown, query?: Record<string, unknown>): VexExpressRequest => ({
  method,
  body: body ?? {},
  query: query ?? {},
});

const mockRes = (): { res: VexExpressResponse; result: MockResponse } => {
  const result: MockResponse = { statusCode: 200, body: undefined };
  const res: VexExpressResponse = {
    json(body: unknown) {
      result.body = body;
      return undefined;
    },
    status(code: number) {
      result.statusCode = code;
      return res;
    },
  };
  return { res, result };
};

describe('express adapter', () => {
  let engine: QueryEngine;

  beforeAll(async () => {
    engine = createQueryEngine({ adapter: createMockAdapter() });
    await engine.introspect();
  });

  describe('GET discovery', () => {
    it('returns discovery response', async () => {
      const handler = vex({ engine, entities: ['items'] });
      const { res, result } = mockRes();
      await handler(mockReq('GET'), res);

      const body = result.body as Record<string, unknown>;
      expect(body['vex']).toBe('1.0');

      const entities = body['entities'] as Array<{ name: string }>;
      expect(entities).toHaveLength(1);
      expect(entities[0]!.name).toBe('items');
    });
  });

  describe('POST query', () => {
    it('returns error for request without agent', async () => {
      const handler = vex({ engine });
      const { res, result } = mockRes();
      await handler(mockReq('POST', { shape: [{ id: '' }], context: {} }), res);

      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      expect((result.body as Record<string, unknown>)['error']).toBeDefined();
    });

    it('returns error on cache miss without agent', async () => {
      const handler = vex({ engine });
      const { res, result } = mockRes();
      await handler(
        mockReq('POST', { shape: [{ id: 0, title: '' }], context: {} }),
        res,
      );

      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('replaying an unknown fingerprint is a 404 cache miss', async () => {
      const handler = vex({ engine });
      const { res, result } = mockRes();
      await handler(mockReq('POST', { fingerprint: 'nope/nothing' }), res);

      expect(result.statusCode).toBe(404);
      expect((result.body as Record<string, unknown>)['error']).toBe('cache_miss');
    });
  });

  describe('unsupported methods', () => {
    it('returns 405 for PUT', async () => {
      const handler = vex({ engine });
      const { res, result } = mockRes();
      await handler(mockReq('PUT'), res);

      expect(result.statusCode).toBe(405);
    });
  });

  describe('fingerprint management', () => {
    it('DELETE without a fingerprint in the body is a 400', async () => {
      const handler = vex({ engine });
      const { res, result } = mockRes();
      await handler(mockReq('DELETE', {}), res);

      expect(result.statusCode).toBe(400);
    });

    it('PATCH on an unknown fingerprint is a 404', async () => {
      const handler = vex({ engine });
      const { res, result } = mockRes();
      await handler(mockReq('PATCH', { fingerprint: 'nope/nothing', protected: true }), res);

      expect(result.statusCode).toBe(404);
    });
  });

  describe('scope', () => {
    it('calls getScope with the request', async () => {
      let receivedReq: VexExpressRequest | undefined;

      const handler = vex({
        engine,
        getScope: (req) => {
          receivedReq = req;
          return { tenantId: 'abc' };
        },
      });

      const { res } = mockRes();
      const req = mockReq('POST', { shape: [{ id: 0 }], context: {} });
      await handler(req, res);

      expect(receivedReq).toBe(req);
    });
  });

  describe('generic type parameter', () => {
    it('accepts extended request type', async () => {
      type AppRequest = VexExpressRequest & { user: { id: string } };

      const handler = vex<AppRequest>({
        engine,
        getScope: (req) => ({ userId: req.user.id }),
      });

      const { res } = mockRes();
      const req: AppRequest = {
        method: 'POST',
        body: { shape: [{ id: '' }], context: {} },
        query: {},
        user: { id: 'user-1' },
      };

      await handler(req, res);
    });
  });
});

describe('express adapter with per-request policy hooks', () => {
  const db = new PGlite();
  const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }) });
  const behaviors = {
    tasks: {
      default: { read: [{ match: 'tenant_id', to: 'tenantId' }] },
      personal: { read: [{ match: 'tenant_id', to: 'tenantId' }, { match: 'owner_id', to: 'userId' }] },
    },
  };
  const grants = new Set(['tasks.read']);
  const handler = vex({
    engine,
    getScope: () => ({ tenantId: 'A', userId: 'u1' }),
    getPolicy: () => createScopePolicy(grants, behaviors),
    getPolicyForReach: (_req, reach) => createScopePolicy(grants, behaviors, reach),
  });

  beforeAll(async () => {
    await db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, tenant_id TEXT, owner_id TEXT, title TEXT);
      CREATE TABLE secrets (id TEXT PRIMARY KEY, val TEXT);
      INSERT INTO tasks VALUES ('t1', 'A', 'u1', 'mine'), ('t2', 'A', 'u2', 'theirs');`);
    await engine.introspect();
    await seedCache(engine.cache, [
      { fingerprint: 'tasks/mine', reach: 'personal', dsl: { from: ['tasks'], fields: ['tasks.title'] }, shape: [{ title: '' }] },
    ]);
  });

  it('lists in discovery only what getPolicy reaches', async () => {
    const { res, result } = mockRes();
    await handler(mockReq('GET'), res);

    const entities = (result.body as { entities: Array<{ name: string }> }).entities;
    expect(entities.map((e) => e.name)).toEqual(['tasks']);
  });

  it('serves an entry with a reach under getPolicyForReach', async () => {
    const { res, result } = mockRes();
    await handler(mockReq('POST', { fingerprint: 'tasks/mine', context: {} }), res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ result: [{ title: 'mine' }] });
  });
});
