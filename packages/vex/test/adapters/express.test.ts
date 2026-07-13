import { describe, it, expect, beforeAll } from 'vitest';
import { vex } from '../../src/adapters/express/index.js';
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
      // Just verifying it compiles and runs without error
    });
  });
});
