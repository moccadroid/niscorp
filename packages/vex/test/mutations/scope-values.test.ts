import { describe, it, expect } from 'vitest';
import { executeMutation } from '../../src/mutations/engine.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import type { Mutation } from '../../src/mutations/schema.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const field = (name: string, type = 'text', primaryKey = false) => ({
  name,
  type,
  normalizedType: (type === 'timestamptz' ? 'timestamp' : 'string') as 'string',
  nullable: !primaryKey,
  primaryKey,
});

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'products',
      table: 'products',
      fields: [field('id', 'text', true), field('name'), field('owner_id'), field('archived_at', 'timestamptz')],
      relations: [],
      indexes: [],
    },
  ],
};

const policy: ScopePolicy = { default: 'deny', entities: { products: { write: [{ set: 'owner_id', to: 'userId' }] } } };

const NOW = '2026-11-26T10:00:00.000Z';

type Call = { sql: string; params: unknown[] };
const recording = (): { client: MutationClient; calls: Call[] } => {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: [{ id: 'p1' }] };
  };
  return { client: { query, transaction: async (fn) => fn({ query }) }, calls };
};

describe('a scope value written into a column', () => {
  it('is accepted wherever a write takes a value', () => {
    const now = { $scope: 'now' };
    const defs = [
      { op: 'insert', table: 'products', values: { archived_at: now }, onConflict: { target: ['id'], set: { archived_at: now } } },
      { op: 'update', table: 'products', set: { archived_at: now }, where: { eq: ['products.id', 'p1'] } },
      { op: 'upsert', table: 'products', key: 'id', columns: { archived_at: now }, insert: { name: now } },
      { op: 'insertEach', table: 'products', items: { $context: 'rows' }, values: { id: { $item: 'id' }, archived_at: now } },
    ];
    for (const def of defs) expect(() => MutationDefinitionSchema.parse(def)).not.toThrow();
  });

  it('binds the server’s value as a parameter, never inlined', async () => {
    const { client, calls } = recording();
    await executeMutation(client, { op: 'update', table: 'products', set: { archived_at: { $scope: 'now' } }, where: { eq: ['products.id', { $context: 'id' }] } }, {
      context: { id: 'p1' },
      scope: { userId: 'u1', now: NOW },
      policy,
      schema,
    });
    expect(calls[0]!.sql).not.toContain(NOW);
    expect(calls[0]!.params).toContain(NOW);
  });

  it('refuses the write when the host supplied no such value, and runs nothing', async () => {
    const { client, calls } = recording();
    await expect(
      executeMutation(client, { op: 'update', table: 'products', set: { archived_at: { $scope: 'now' } }, where: { eq: ['products.id', 'p1'] } }, {
        context: {},
        scope: { userId: 'u1' },
        policy,
        schema,
      }),
    ).rejects.toMatchObject({ code: 'missing_scope' });
    expect(calls).toHaveLength(0);
  });

  it('cannot take the place of the policy’s own column', async () => {
    const { client, calls } = recording();
    await executeMutation(client, { op: 'insert', table: 'products', values: { id: 'p1', owner_id: { $scope: 'other' } } }, {
      context: {},
      scope: { userId: 'u1', other: 'u2' },
      policy,
      schema,
    });
    expect(calls[0]!.params).toContain('u1');
    expect(calls[0]!.params).not.toContain('u2');
  });

  it('is the same instant in every statement of a batch', async () => {
    const { client, calls } = recording();
    const archive = (id: string): Mutation => ({ op: 'update', table: 'products', set: { archived_at: { $scope: 'now' } }, where: { eq: ['products.id', id] } });
    await executeMutation(client, [archive('p1'), archive('p2')], { context: {}, scope: { userId: 'u1', now: NOW }, policy, schema });
    expect(calls.map((c) => c.params.filter((p) => p === NOW))).toEqual([[NOW], [NOW]]);
  });

  it('binds in a write’s WHERE as well', async () => {
    const { client, calls } = recording();
    await executeMutation(client, { op: 'delete', table: 'products', where: { lt: ['products.archived_at', { $scope: 'now' }] } }, {
      context: {},
      scope: { userId: 'u1', now: NOW },
      policy,
      schema,
    });
    expect(calls[0]!.sql).toMatch(/archived_at < \$1/);
    expect(calls[0]!.params).toEqual([NOW]);
  });
});
