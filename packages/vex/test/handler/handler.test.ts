import { describe, it, expect, beforeAll } from 'vitest';
import { handleDiscovery, handleQuery } from '../../src/handler.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseAdapter, CompiledQuery, BoundParams, Row } from '../../src/adapters/adapter.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ResolvedQuery } from '../../src/engine/engine.types.js';

const TEST_SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'customers',
      table: 'customers',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'email', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'status', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [
        { type: 'hasMany', entity: 'orders', localField: 'id', foreignField: 'customer_id' },
      ],
      indexes: [
        { name: 'customers_pkey', fields: ['id'], unique: true, type: 'btree' },
      ],
      rowCount: 20,
    },
    {
      name: 'orders',
      table: 'orders',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'uuid', nullable: false, primaryKey: true },
        { name: 'customer_id', type: 'uuid', normalizedType: 'uuid', nullable: false, primaryKey: false },
        { name: 'total', type: 'numeric', normalizedType: 'number', nullable: false, primaryKey: false },
        { name: 'status', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [
        { type: 'belongsTo', entity: 'customers', localField: 'customer_id', foreignField: 'id' },
      ],
      indexes: [
        { name: 'orders_pkey', fields: ['id'], unique: true, type: 'btree' },
        { name: 'idx_orders_customer_id', fields: ['customer_id'], unique: false, type: 'btree' },
      ],
      rowCount: 100,
    },
  ],
};

const createMockAdapter = (): DatabaseAdapter => ({
  id: 'mock',
  introspect: async () => TEST_SCHEMA,
  compile: (resolved: ResolvedQuery): CompiledQuery => ({
    sql: 'SELECT 1',
    paramSlots: [],
    contextContract: {},
  }),
  execute: async (_q: CompiledQuery, _p: BoundParams): Promise<Row[]> => [
    { id: 'c1', name: 'Alice', email: 'alice@example.com' },
    { id: 'c2', name: 'Bob', email: 'bob@example.com' },
  ],
  capabilities: {
    vectorSearch: false,
    fuzzyMatch: false,
    jsonFields: false,
    fullTextSearch: false,
    returningClause: false,
    cte: false,
    windowFunctions: false,
    statementTimeout: false,
  },
});

describe('handler', () => {
  let engine: QueryEngine;

  beforeAll(async () => {
    const adapter = createMockAdapter();
    engine = createQueryEngine({ adapter });
    await engine.introspect();
  });

  describe('handleDiscovery', () => {
    it('returns vex version and description', async () => {
      const result = await handleDiscovery({ engine });
      expect(result.vex).toBe('1.0');
      expect(result.description).toContain('natural language');
    });

    it('includes all entities when no filter', async () => {
      const result = await handleDiscovery({ engine });
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map(e => e.name)).toEqual(['customers', 'orders']);
    });

    it('filters entities when specified', async () => {
      const result = await handleDiscovery({ engine, entities: ['customers'] });
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.name).toBe('customers');
    });

    it('includes fields with types', async () => {
      const result = await handleDiscovery({ engine, entities: ['customers'] });
      const customer = result.entities[0]!;
      expect(customer.fields).toContainEqual({
        name: 'id',
        type: 'uuid',
        nullable: false,
        primaryKey: true,
      });
      expect(customer.fields).toContainEqual({
        name: 'name',
        type: 'string',
        nullable: false,
        primaryKey: false,
      });
    });

    it('includes relations', async () => {
      const result = await handleDiscovery({ engine, entities: ['customers'] });
      const customer = result.entities[0]!;
      expect(customer.relations).toContainEqual({
        entity: 'orders',
        type: 'hasMany',
        via: 'id',
      });
    });

    it('includes row counts', async () => {
      const result = await handleDiscovery({ engine, entities: ['customers'] });
      expect(result.entities[0]!.rowCount).toBe(20);
    });

    it('includes query format documentation (fingerprint in the body)', async () => {
      const result = await handleDiscovery({ engine });
      expect(result.query.method).toBe('POST');
      expect(result.query.accepts).toBe('application/json');
      expect(result.query.body).toHaveProperty('fingerprint');
      expect(result.query.body).toHaveProperty('intent');
      expect(result.query.body).toHaveProperty('shape');
      expect(result.query.body).toHaveProperty('context');
    });

    it('reports governance: protection summary, locked flag, fingerprint list', async () => {
      const result = await handleDiscovery({ engine });
      expect(result.protection).toBe('none');
      expect(result.locked).toBe(false);
      expect(Array.isArray(result.fingerprints)).toBe(true);
    });

    it('includes DSL JSON Schema', async () => {
      const result = await handleDiscovery({ engine });
      expect(result.dsl).toBeDefined();
      expect(typeof result.dsl).toBe('object');
    });
  });

  describe('handleQuery', () => {
    it('rejects invalid request body', async () => {
      const result = await handleQuery({ engine }, 'not json', {});
      expect(result.status).toBe(400);
      expect((result.body as Record<string, unknown>)['error']).toBe('invalid_request');
    });

    it('rejects a request with neither shape nor fingerprint', async () => {
      const result = await handleQuery({ engine }, { intent: 'test' }, {});
      expect(result.status).toBe(400);
    });

    it('returns error when no agent and no cache hit', async () => {
      const result = await handleQuery(
        { engine },
        { shape: [{ id: '', name: '' }], context: {} },
        {},
      );
      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('replaying an unknown fingerprint is a 404 cache miss', async () => {
      const result = await handleQuery({ engine }, { fingerprint: 'nope/nothing' }, {});
      expect(result.status).toBe(404);
      expect((result.body as Record<string, unknown>)['error']).toBe('cache_miss');
    });

    it('locked endpoints refuse generation', async () => {
      const result = await handleQuery(
        { engine, locked: true },
        { shape: [{ id: '', name: '' }], context: {} },
        {},
      );
      expect(result.status).toBe(400);
      expect((result.body as Record<string, unknown>)['error']).toBe('locked');
    });
  });
});
