import { describe, it, expect, beforeAll } from 'vitest';
import { handleQuery } from '../../src/handler.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import type { QueryEngine } from '../../src/types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { DatabaseAdapter, CompiledQuery, BoundParams, Row } from '../../src/adapters/adapter.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ResolvedQuery } from '../../src/engine/engine.types.js';

const SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'bookings',
      table: 'bookings',
      fields: [
        { name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'studio_id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'membership_id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'bookings_pkey', fields: ['id'], unique: true, type: 'btree' }],
      rowCount: 100,
    },
  ],
};

let lastSql = '';

const adapter = (): DatabaseAdapter => ({
  id: 'test',
  introspect: async (): Promise<DatabaseSchema> => SCHEMA,
  compile: (q: ResolvedQuery): CompiledQuery => ({
    sql: `SELECT * FROM bookings${q.filter !== undefined ? ` WHERE ${JSON.stringify(q.filter)}` : ''}`,
    paramSlots: [],
    contextContract: {},
  }),
  execute: async (q: CompiledQuery): Promise<Row[]> => {
    lastSql = q.sql;
    return [{ id: 'b1' }];
  },
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

const WIDE: ScopePolicy = {
  default: 'deny',
  entities: { bookings: { read: [{ match: 'studio_id', to: 'studioId' }] } },
};

const NARROW: ScopePolicy = {
  default: 'deny',
  entities: {
    bookings: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'membership_id', to: 'membershipId' }] },
  },
};

const SCOPE = { userId: 'p1', studioId: 'st1', membershipId: 'm1' };

describe('an entry that declares its reach', () => {
  let engine: QueryEngine;

  beforeAll(async () => {
    engine = createQueryEngine({ adapter: adapter(), cache: createMemoryCache() });
    await engine.introspect();
    await engine.cache.set('mine', {
      kind: 'ok',
      dsl: { from: ['bookings'], fields: ['bookings.id'] },
      reach: 'personal',
      protected: true,
      createdAt: Date.now(),
    });
    await engine.cache.set('theirs', {
      kind: 'ok',
      dsl: { from: ['bookings'], fields: ['bookings.id'] },
      protected: true,
      createdAt: Date.now(),
    });
  });

  it('is served at the declared reach, not the caller’s', async () => {
    const res = await handleQuery(
      { engine, scopePolicy: WIDE, policyForReach: () => NARROW },
      { fingerprint: 'mine', context: {} },
      SCOPE,
    );
    expect(res.status).toBe(200);
    expect(lastSql).toContain('membership_id');
  });

  it('leaves an entry that declares nothing at the caller’s reach', async () => {
    const res = await handleQuery(
      { engine, scopePolicy: WIDE, policyForReach: () => NARROW },
      { fingerprint: 'theirs', context: {} },
      SCOPE,
    );
    expect(res.status).toBe(200);
    expect(lastSql).toContain('studio_id');
    expect(lastSql).not.toContain('membership_id');
  });

  it('refuses when the host offers no reach resolver', async () => {
    const res = await handleQuery({ engine, scopePolicy: WIDE }, { fingerprint: 'mine', context: {} }, SCOPE);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).toContain('policyForReach');
  });

  it('refuses when the reach is not available to this principal', async () => {
    const res = await handleQuery(
      { engine, scopePolicy: WIDE, policyForReach: () => undefined },
      { fingerprint: 'mine', context: {} },
      SCOPE,
    );
    expect(res.status).toBe(403);
  });
});

const WRITE_WIDE: ScopePolicy = {
  default: 'deny',
  entities: { bookings: { update: [{ match: 'studio_id', to: 'studioId' }] } },
};
const WRITE_NARROW: ScopePolicy = {
  default: 'deny',
  entities: {
    bookings: { update: [{ match: 'studio_id', to: 'studioId' }, { match: 'membership_id', to: 'membershipId' }] },
  },
};

describe('a mutation that declares its reach', () => {
  let engine: QueryEngine;
  let writeSql = '';
  const client = { query: async (sql: string) => { writeSql = sql; return { rows: [{ id: 'b1' }] }; } };

  beforeAll(async () => {
    engine = createQueryEngine({ adapter: adapter(), cache: createMemoryCache() });
    await engine.introspect();
    await engine.cache.set('cancel-mine', {
      kind: 'mutation',
      mutation: { op: 'update', table: 'bookings', set: { studio_id: 'st1' }, where: { eq: ['bookings.id', { $context: 'bookingId' }] } },
      reach: 'personal',
      protected: true,
      createdAt: Date.now(),
    });
    await engine.cache.set('cancel-any', {
      kind: 'mutation',
      mutation: { op: 'update', table: 'bookings', set: { studio_id: 'st1' }, where: { eq: ['bookings.id', { $context: 'bookingId' }] } },
      protected: true,
      createdAt: Date.now(),
    });
  });

  const run = (fingerprint: string, policyForReach?: () => ScopePolicy | undefined) =>
    handleQuery(
      { engine, scopePolicy: WIDE, ...(policyForReach !== undefined ? { policyForReach } : {}), mutations: { client: client as never, policy: WRITE_WIDE } },
      { fingerprint, context: { bookingId: 'b1' } },
      SCOPE,
    );

  it('is executed under the declared reach, not the caller’s', async () => {
    writeSql = '';
    const res = await run('cancel-mine', () => WRITE_NARROW);
    expect(res.status).toBe(200);
    expect(writeSql).toContain('membership_id');
  });

  it('leaves a mutation that declares nothing at the caller’s reach', async () => {
    writeSql = '';
    const res = await run('cancel-any', () => WRITE_NARROW);
    expect(res.status).toBe(200);
    expect(writeSql).toContain('studio_id');
    expect(writeSql).not.toContain('membership_id');
  });

  it('refuses when the reach cannot be produced', async () => {
    expect((await run('cancel-mine', () => undefined)).status).toBe(403);
  });

  it('refuses when the host offers no resolver at all', async () => {
    expect((await run('cancel-mine')).status).toBe(500);
  });
});
