import { describe, it, expect } from 'vitest';
import { discoverEntities, extractEntityFromPath } from '../../src/scope/discover.js';
import { applyScope, checkScope, VexScopeError } from '../../src/scope/apply.js';
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
    // The alias is a derived relation, not a table — it must NOT surface as
    // an entity (under default-deny it would be undeniable-to-list). The
    // subquery's real table is what gets scoped.
    expect(entities.has('sub')).toBe(false);
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
    const result = applyScope(baseDsl, new Set(['users']), policy);
    expect(result.filter).toBeUndefined();
    expect(result.from).toEqual(['users']);
  });

  it('throws VexScopeError when entity denied explicitly', () => {
    const policy: ScopePolicy = { default: 'allow', entities: { users: { deny: true } } };
    expect(() => applyScope(baseDsl, new Set(['users']), policy)).toThrow(VexScopeError);
  });

  it('throws VexScopeError when entity has no rule and default is deny', () => {
    const policy: ScopePolicy = { default: 'deny', entities: {} };
    expect(() => applyScope(baseDsl, new Set(['users']), policy)).toThrow(VexScopeError);
  });

  it('throws on read when a listed entity has only a write block and default is deny', () => {
    const policy: ScopePolicy = {
      default: 'deny',
      entities: { users: { write: [{ set: 'owner_id', to: 'userId' }] } },
    };
    expect(() => applyScope(baseDsl, new Set(['users']), policy)).toThrow(VexScopeError);
  });

  it('a write-only rule does not filter reads (default allow)', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: { users: { write: [{ set: 'owner_id', to: 'userId' }] } },
    };
    const result = applyScope(baseDsl, new Set(['users']), policy);
    expect(result.filter).toBeUndefined();
  });

  it('skips public entities', () => {
    const policy: ScopePolicy = { default: 'deny', entities: { users: { public: true } } };
    const result = applyScope(baseDsl, new Set(['users']), policy);
    expect(result.filter).toBeUndefined();
  });

  it('an empty read block allows reads with no filter', () => {
    const policy: ScopePolicy = { default: 'deny', entities: { users: { read: [] } } };
    const result = applyScope(baseDsl, new Set(['users']), policy);
    expect(result.filter).toBeUndefined();
  });

  // Row-rule PLACEMENT is no longer a DSL concern — it needs join kinds, which
  // only the resolver knows. Those assertions live in scope-placement.test.ts,
  // against the compiled SQL, which is the only place the distinction between
  // a WHERE and an ON clause is observable at all.

  it('does not mutate the original DSL', () => {
    const original: Query = {
      from: ['users'],
      fields: ['users.id'],
      filter: { eq: ['users.active', true] },
    };
    const originalCopy = JSON.parse(JSON.stringify(original)) as Query;
    const policy: ScopePolicy = {
      default: 'allow',
      entities: { users: { read: [{ match: 'tenantId', to: 'tenant' }] } },
    };
    applyScope(original, new Set(['users']), policy);
    expect(original).toEqual(originalCopy);
  });
});

// ───────────────────────────────────────────────────────────────
// Subquery aliases are derived relations, not entities
// ───────────────────────────────────────────────────────────────

describe('discoverEntities — subquery aliases', () => {
  // The sidebar-counts shape: per-table COUNT(*) subqueries cross-joined,
  // outer fields referencing the ALIASES (c.n / t.n). The aliases must not
  // surface as entities; the inner real tables must.
  const counts: Query = {
    from: [
      { as: 'c', query: { from: ['contacts'], aggregate: { n: { count: '*' } } } },
      { as: 't', query: { from: ['tasks'], aggregate: { n: { count: '*' } }, filter: { eq: ['tasks.done', false] } } },
    ],
    fields: ['c.n', 't.n'],
  };

  it('collects inner tables, not the aliases', () => {
    const entities = discoverEntities(counts);
    expect(entities.has('contacts')).toBe(true);
    expect(entities.has('tasks')).toBe(true);
    expect(entities.has('c')).toBe(false);
    expect(entities.has('t')).toBe(false);
  });

  it('an alias reference survives default-deny scope; the inner table is still scoped', () => {
    const policy: ScopePolicy = {
      default: 'deny',
      entities: {
        contacts: { read: [] },
        tasks: { read: [{ match: 'assignee_id', to: 'userId' }] },
      },
    };
    // Nothing throws on the aliases 'c'/'t' — they are not tables. The tasks
    // rule itself is placed at resolution; see scope-placement.test.ts.
    expect(() => checkScope(discoverEntities(counts), policy)).not.toThrow();
  });

  it('still denies a real unlisted entity at the same level as an alias', () => {
    const mixed: Query = {
      from: ['orders', { as: 'c', query: { from: ['contacts'], aggregate: { n: { count: '*' } } } }],
      fields: ['orders.id', 'c.n'],
    };
    const policy: ScopePolicy = { default: 'deny', entities: { contacts: { read: [] } } };
    expect(() => applyScope(mixed, discoverEntities(mixed), policy)).toThrow(VexScopeError);
  });
});
