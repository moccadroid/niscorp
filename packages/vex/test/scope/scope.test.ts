import { describe, it, expect } from 'vitest';
import { discoverEntities, extractEntityFromPath } from '../../src/scope/discover.js';
import { applyScope, VexScopeError } from '../../src/scope/apply.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// ───────────────────────────────────────────────────────────────
// discoverEntities
// ───────────────────────────────────────────────────────────────

describe('discoverEntities', () => {
  it('discovers entities from from (string sources)', () => {
    const dsl: Query = { from: ['users', 'orders'], fields: ['users.id'] };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
    expect(entities.has('orders')).toBe(true);
  });

  it('discovers from fields paths', () => {
    const dsl: Query = { from: ['users'], fields: ['users.name', 'users.email'] };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('discovers from filter paths (comparison operators)', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { eq: ['users.tenantId', 'tenants.id'] },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
    expect(entities.has('tenants')).toBe(true);
  });

  it('discovers from filter paths (in operator)', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { in: ['users.role', ['admin', 'editor']] },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('discovers from filter paths (like operator)', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { like: ['users.name', '%john%'] },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('discovers from filter paths (isNull)', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { isNull: 'users.deletedAt' },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('discovers from filter paths (isNotNull)', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { isNotNull: 'users.email' },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('discovers from filter paths (and/or/not)', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: {
        and: [
          { eq: ['users.active', true] },
          { not: { eq: ['accounts.banned', true] } },
        ],
      },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
    expect(entities.has('accounts')).toBe(true);
  });

  it('discovers from filter paths (semantic)', () => {
    const dsl: Query = {
      from: ['articles'],
      fields: ['articles.id'],
      filter: { semantic: { field: 'articles.embedding', query: { $context: 'q' } } },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('articles')).toBe(true);
  });

  it('discovers from filter paths (fuzzy)', () => {
    const dsl: Query = {
      from: ['products'],
      fields: ['products.id'],
      filter: { fuzzy: { field: 'products.name', query: { $context: 'q' } } },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('products')).toBe(true);
  });

  it('discovers from compute expressions', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      compute: { total: { add: ['orders.price', 'orders.tax'] } },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('orders')).toBe(true);
  });

  it('discovers from compute concat', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.id'],
      compute: { fullName: { concat: ['users.firstName', 'users.lastName'] } },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('discovers from compute case expression', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      compute: {
        tier: {
          case: {
            when: [{ condition: { gt: ['orders.total', 100] }, then: 'premium' }],
            else: 'basic',
          },
        },
      },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('orders')).toBe(true);
  });

  it('discovers from aggregate expressions', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.userId'],
      aggregate: { total: { sum: 'orders.amount' } },
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('orders')).toBe(true);
  });

  it('discovers from groupBy paths', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.userId'],
      groupBy: ['orders.userId', 'orders.status'],
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('orders')).toBe(true);
  });

  it('discovers from sort fields', () => {
    const dsl: Query = {
      from: ['users'],
      fields: ['users.name'],
      sort: [{ field: 'users.createdAt', dir: 'desc' }],
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
  });

  it('recurses into subqueries', () => {
    const dsl: Query = {
      from: [
        {
          as: 'sub',
          query: {
            from: ['orders'],
            fields: ['orders.userId', 'orders.total'],
          },
        },
      ],
      fields: ['sub.userId'],
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('orders')).toBe(true);
    expect(entities.has('sub')).toBe(true);
  });

  it('ignores non-entity strings (no dot)', () => {
    const entity = extractEntityFromPath('simple');
    expect(entity).toBeUndefined();
  });

  it('ignores strings with more than one dot', () => {
    const entity = extractEntityFromPath('a.b.c');
    expect(entity).toBeUndefined();
  });

  it('handles complex query with multiple entities across all locations', () => {
    const dsl: Query = {
      from: ['users', 'roles'],
      fields: ['users.name', 'roles.title'],
      filter: {
        and: [
          { eq: ['users.roleId', 'roles.id'] },
          { in: ['users.status', ['active']] },
        ],
      },
      compute: { label: { concat: ['users.name', 'roles.title'] } },
      aggregate: { count: { count: '*' } },
      groupBy: ['users.name'],
      sort: [{ field: 'roles.title', dir: 'asc' }],
    };
    const entities = discoverEntities(dsl);
    expect(entities.has('users')).toBe(true);
    expect(entities.has('roles')).toBe(true);
    expect(entities.size).toBeGreaterThanOrEqual(2);
  });
});

// ───────────────────────────────────────────────────────────────
// applyScope
// ───────────────────────────────────────────────────────────────

describe('applyScope', () => {
  const baseDsl: Query = {
    from: ['users'],
    fields: ['users.id', 'users.name'],
  };

  it('no-op when policy default is allow and no entity rules', () => {
    const policy: ScopePolicy = { default: 'allow', entities: {} };
    const entities = new Set(['users']);
    const result = applyScope(baseDsl, entities, policy);
    expect(result.filter).toBeUndefined();
    expect(result.from).toEqual(['users']);
  });

  it('throws VexScopeError when entity denied explicitly', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: { users: { deny: true } },
    };
    const entities = new Set(['users']);
    expect(() => applyScope(baseDsl, entities, policy)).toThrow(VexScopeError);
  });

  it('throws VexScopeError when entity has no rule and default is deny', () => {
    const policy: ScopePolicy = { default: 'deny', entities: {} };
    const entities = new Set(['users']);
    expect(() => applyScope(baseDsl, entities, policy)).toThrow(VexScopeError);
  });

  it('skips public entities', () => {
    const policy: ScopePolicy = {
      default: 'deny',
      entities: { users: { public: true } },
    };
    const entities = new Set(['users']);
    const result = applyScope(baseDsl, entities, policy);
    expect(result.filter).toBeUndefined();
  });

  it('injects eq filter for filter rule with default op', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        users: { field: 'tenantId', source: 'tenant' },
      },
    };
    const entities = new Set(['users']);
    const result = applyScope(baseDsl, entities, policy);
    expect(result.filter).toEqual({
      eq: ['users.tenantId', { $scope: 'tenant' }],
    });
  });

  it('injects in filter for op: in rule', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        users: { field: 'orgId', source: 'orgs', op: 'in' },
      },
    };
    const entities = new Set(['users']);
    const result = applyScope(baseDsl, entities, policy);
    expect(result.filter).toEqual({
      in: ['users.orgId', { $scope: 'orgs' }],
    });
  });

  it('injects neq filter for op: neq rule', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        users: { field: 'status', source: 'excludeStatus', op: 'neq' },
      },
    };
    const entities = new Set(['users']);
    const result = applyScope(baseDsl, entities, policy);
    expect(result.filter).toEqual({
      neq: ['users.status', { $scope: 'excludeStatus' }],
    });
  });

  it('AND-merges scope filter with existing filter', () => {
    const dslWithFilter: Query = {
      ...baseDsl,
      filter: { eq: ['users.active', true] },
    };
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        users: { field: 'tenantId', source: 'tenant' },
      },
    };
    const entities = new Set(['users']);
    const result = applyScope(dslWithFilter, entities, policy);
    expect(result.filter).toEqual({
      and: [
        { eq: ['users.active', true] },
        { eq: ['users.tenantId', { $scope: 'tenant' }] },
      ],
    });
  });

  it('multiple filter rules produce AND-combined filters', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        users: [
          { field: 'tenantId', source: 'tenant' },
          { field: 'orgId', source: 'org', op: 'in' },
        ],
      },
    };
    const entities = new Set(['users']);
    const result = applyScope(baseDsl, entities, policy);
    expect(result.filter).toEqual({
      and: [
        { eq: ['users.tenantId', { $scope: 'tenant' }] },
        { in: ['users.orgId', { $scope: 'org' }] },
      ],
    });
  });

  it('recurses into subqueries', () => {
    const dslWithSub: Query = {
      from: [
        {
          as: 'sub',
          query: {
            from: ['orders'],
            fields: ['orders.userId'],
          },
        },
      ],
      fields: ['sub.userId'],
    };
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        orders: { field: 'tenantId', source: 'tenant' },
      },
    };
    const entities = new Set(['orders', 'sub']);
    const result = applyScope(dslWithSub, entities, policy);

    const subSource = result.from[0];
    expect(typeof subSource).toBe('object');
    if (typeof subSource === 'object' && subSource !== null && 'query' in subSource) {
      expect(subSource.query.filter).toEqual({
        eq: ['orders.tenantId', { $scope: 'tenant' }],
      });
    }
  });

  it('does not mutate the original DSL', () => {
    const original: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { eq: ['users.active', true] },
    };
    const originalCopy = JSON.parse(JSON.stringify(original)) as Query;
    const policy: ScopePolicy = {
      default: 'allow',
      entities: {
        users: { field: 'tenantId', source: 'tenant' },
      },
    };
    const entities = new Set(['users']);
    applyScope(original, entities, policy);
    expect(original).toEqual(originalCopy);
  });
});
