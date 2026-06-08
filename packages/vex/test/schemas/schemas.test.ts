import { describe, it, expect } from 'vitest';
import { ContextRefSchema, ScopeRefSchema, FieldOrValueSchema } from '../../src/schemas/value.schema.js';
import { FilterSchema } from '../../src/schemas/filter.schema.js';
import { ComputeExpressionSchema } from '../../src/schemas/compute.schema.js';
import { AggregateExpressionSchema } from '../../src/schemas/aggregate.schema.js';
import { QuerySchema } from '../../src/schemas/query.schema.js';
import { QueryRequestSchema } from '../../src/schemas/request.schema.js';

// ───────────────────────────────────────────────────────────────
// Value schemas
// ───────────────────────────────────────────────────────────────

describe('Value schemas', () => {
  describe('ContextRefSchema', () => {
    it('accepts { $context: "key" }', () => {
      const result = ContextRefSchema.safeParse({ $context: 'userId' });
      expect(result.success).toBe(true);
    });

    it('rejects extra properties', () => {
      const result = ContextRefSchema.safeParse({ $context: 'userId', extra: true });
      expect(result.success).toBe(false);
    });

    it('rejects missing $context', () => {
      const result = ContextRefSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ScopeRefSchema', () => {
    it('accepts { $scope: "key" }', () => {
      const result = ScopeRefSchema.safeParse({ $scope: 'tenantId' });
      expect(result.success).toBe(true);
    });

    it('rejects extra properties', () => {
      const result = ScopeRefSchema.safeParse({ $scope: 'tenantId', extra: 1 });
      expect(result.success).toBe(false);
    });

    it('rejects missing $scope', () => {
      const result = ScopeRefSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('FieldOrValueSchema', () => {
    it('accepts a string', () => {
      const result = FieldOrValueSchema.safeParse('user.name');
      expect(result.success).toBe(true);
    });

    it('accepts a number', () => {
      const result = FieldOrValueSchema.safeParse(42);
      expect(result.success).toBe(true);
    });

    it('accepts a boolean', () => {
      const result = FieldOrValueSchema.safeParse(true);
      expect(result.success).toBe(true);
    });

    it('accepts null', () => {
      const result = FieldOrValueSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    it('accepts a context ref', () => {
      const result = FieldOrValueSchema.safeParse({ $context: 'key' });
      expect(result.success).toBe(true);
    });

    it('accepts a scope ref', () => {
      const result = FieldOrValueSchema.safeParse({ $scope: 'key' });
      expect(result.success).toBe(true);
    });

    it('rejects an object without $context or $scope', () => {
      const result = FieldOrValueSchema.safeParse({ foo: 'bar' });
      expect(result.success).toBe(false);
    });
  });
});

// ───────────────────────────────────────────────────────────────
// Filter schema
// ───────────────────────────────────────────────────────────────

describe('Filter schema', () => {
  describe('comparison operators', () => {
    const ops = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

    for (const op of ops) {
      it(`${op} accepts [fieldOrValue, fieldOrValue]`, () => {
        const result = FilterSchema.safeParse({ [op]: ['user.age', 18] });
        expect(result.success).toBe(true);
      });

      it(`${op} rejects missing operands`, () => {
        const result = FilterSchema.safeParse({ [op]: ['user.age'] });
        expect(result.success).toBe(false);
      });

      it(`${op} rejects extra properties`, () => {
        const result = FilterSchema.safeParse({ [op]: ['a', 'b'], extra: true });
        expect(result.success).toBe(false);
      });
    }
  });

  describe('in / notIn', () => {
    it('in accepts [field, [values]]', () => {
      const result = FilterSchema.safeParse({ in: ['user.role', ['admin', 'editor']] });
      expect(result.success).toBe(true);
    });

    it('notIn accepts [field, [values]]', () => {
      const result = FilterSchema.safeParse({ notIn: ['user.status', ['banned', 'suspended']] });
      expect(result.success).toBe(true);
    });

    it('in accepts [field, { $context: key }]', () => {
      const result = FilterSchema.safeParse({ in: ['user.id', { $context: 'allowedIds' }] });
      expect(result.success).toBe(true);
    });

    it('notIn accepts [field, { $scope: key }]', () => {
      const result = FilterSchema.safeParse({ notIn: ['user.id', { $scope: 'blockedIds' }] });
      expect(result.success).toBe(true);
    });
  });

  describe('like / ilike', () => {
    it('like accepts [field, pattern]', () => {
      const result = FilterSchema.safeParse({ like: ['user.name', '%john%'] });
      expect(result.success).toBe(true);
    });

    it('ilike accepts [field, pattern]', () => {
      const result = FilterSchema.safeParse({ ilike: ['user.email', '%@example.com'] });
      expect(result.success).toBe(true);
    });
  });

  describe('isNull / isNotNull', () => {
    it('isNull accepts a field string', () => {
      const result = FilterSchema.safeParse({ isNull: 'user.deletedAt' });
      expect(result.success).toBe(true);
    });

    it('isNotNull accepts a field string', () => {
      const result = FilterSchema.safeParse({ isNotNull: 'user.email' });
      expect(result.success).toBe(true);
    });
  });

  describe('logical operators', () => {
    it('and accepts an array of filters (min 2)', () => {
      const result = FilterSchema.safeParse({
        and: [
          { eq: ['user.active', true] },
          { gt: ['user.age', 18] },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('and rejects fewer than 2 filters', () => {
      const result = FilterSchema.safeParse({
        and: [{ eq: ['user.active', true] }],
      });
      expect(result.success).toBe(false);
    });

    it('or accepts an array of filters (min 2)', () => {
      const result = FilterSchema.safeParse({
        or: [
          { eq: ['user.role', 'admin'] },
          { eq: ['user.role', 'editor'] },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('not accepts a single filter', () => {
      const result = FilterSchema.safeParse({
        not: { eq: ['user.banned', true] },
      });
      expect(result.success).toBe(true);
    });

    it('handles nested logic', () => {
      const result = FilterSchema.safeParse({
        and: [
          { eq: ['user.active', true] },
          { or: [{ gt: ['user.age', 18] }, { lt: ['user.age', 65] }] },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('semantic', () => {
    it('accepts { field, query: { $context }, minScore }', () => {
      const result = FilterSchema.safeParse({
        semantic: {
          field: 'article.embedding',
          query: { $context: 'searchQuery' },
          minScore: 0.8,
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts without optional minScore', () => {
      const result = FilterSchema.safeParse({
        semantic: {
          field: 'article.embedding',
          query: { $scope: 'interest' },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('fuzzy', () => {
    it('accepts { field, query: { $context }, maxDistance }', () => {
      const result = FilterSchema.safeParse({
        fuzzy: {
          field: 'product.name',
          query: { $context: 'searchTerm' },
          maxDistance: 2,
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts without optional maxDistance', () => {
      const result = FilterSchema.safeParse({
        fuzzy: {
          field: 'product.name',
          query: { $scope: 'term' },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid filters', () => {
    it('rejects unknown operator keys', () => {
      const result = FilterSchema.safeParse({ between: ['a', 1, 10] });
      expect(result.success).toBe(false);
    });

    it('rejects empty objects', () => {
      const result = FilterSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ───────────────────────────────────────────────────────────────
// Compute schema
// ───────────────────────────────────────────────────────────────

describe('Compute schema', () => {
  describe('arithmetic operators', () => {
    const ops = ['add', 'subtract', 'multiply', 'divide'] as const;

    for (const op of ops) {
      it(`${op} accepts [fieldOrValue, fieldOrValue]`, () => {
        const result = ComputeExpressionSchema.safeParse({ [op]: ['order.price', 'order.tax'] });
        expect(result.success).toBe(true);
      });
    }
  });

  describe('concat', () => {
    it('accepts an array of at least 2 values', () => {
      const result = ComputeExpressionSchema.safeParse({
        concat: ['user.firstName', '" "', 'user.lastName'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects fewer than 2 values', () => {
      const result = ComputeExpressionSchema.safeParse({ concat: ['only'] });
      expect(result.success).toBe(false);
    });
  });

  describe('coalesce', () => {
    it('accepts an array of at least 2 values', () => {
      const result = ComputeExpressionSchema.safeParse({
        coalesce: ['user.nickname', 'user.name'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects fewer than 2 values', () => {
      const result = ComputeExpressionSchema.safeParse({ coalesce: ['only'] });
      expect(result.success).toBe(false);
    });
  });

  describe('case', () => {
    it('accepts { when: [{ condition, then }], else: value }', () => {
      const result = ComputeExpressionSchema.safeParse({
        case: {
          when: [
            { condition: { gt: ['order.total', 100] }, then: 'premium' },
            { condition: { gt: ['order.total', 50] }, then: 'standard' },
          ],
          else: 'basic',
        },
      });
      expect(result.success).toBe(true);
    });

    it('requires at least one when clause', () => {
      const result = ComputeExpressionSchema.safeParse({
        case: {
          when: [],
          else: 'fallback',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  it('rejects unknown keys', () => {
    const result = ComputeExpressionSchema.safeParse({ modulo: [10, 3] });
    expect(result.success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// Aggregate schema
// ───────────────────────────────────────────────────────────────

describe('Aggregate schema', () => {
  const aggOps = ['count', 'sum', 'avg', 'min', 'max'] as const;

  for (const op of aggOps) {
    it(`${op} accepts a field string`, () => {
      const result = AggregateExpressionSchema.safeParse({ [op]: 'order.amount' });
      expect(result.success).toBe(true);
    });
  }

  it('count accepts "*"', () => {
    const result = AggregateExpressionSchema.safeParse({ count: '*' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys', () => {
    const result = AggregateExpressionSchema.safeParse({ median: 'order.amount' });
    expect(result.success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// Query schema
// ───────────────────────────────────────────────────────────────

describe('Query schema', () => {
  it('accepts a minimal valid query', () => {
    const result = QuerySchema.safeParse({
      from: ['users'],
      fields: ['users.name'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a full query with all optional fields', () => {
    const result = QuerySchema.safeParse({
      from: ['users', 'orders'],
      fields: ['users.name', 'orders.total'],
      filter: { eq: ['users.id', 'orders.userId'] },
      compute: { fullName: { concat: ['users.firstName', 'users.lastName'] } },
      aggregate: { totalOrders: { count: '*' } },
      groupBy: ['users.name'],
      sort: [{ field: 'users.name', dir: 'asc' }],
      limit: 10,
      distinct: true,
    });
    expect(result.success).toBe(true);
  });

  it('requires fields with at least 1 element', () => {
    const result = QuerySchema.safeParse({
      from: ['users'],
      fields: [],
    });
    expect(result.success).toBe(false);
  });

  it('requires from with at least 1 element', () => {
    const result = QuerySchema.safeParse({
      from: [],
      fields: ['users.name'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra properties (strict)', () => {
    const result = QuerySchema.safeParse({
      from: ['users'],
      fields: ['users.name'],
      unknown: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts subqueries in from', () => {
    const result = QuerySchema.safeParse({
      from: [
        {
          as: 'sub',
          query: {
            from: ['orders'],
            fields: ['orders.userId', 'orders.total'],
          },
        },
      ],
      fields: ['sub.userId', 'sub.total'],
    });
    expect(result.success).toBe(true);
  });

  it('applies default sort direction', () => {
    const result = QuerySchema.safeParse({
      from: ['users'],
      fields: ['users.name'],
      sort: [{ field: 'users.name' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort?.[0]?.dir).toBe('asc');
    }
  });

  it('requires limit to be a positive integer', () => {
    const negativeLimit = QuerySchema.safeParse({
      from: ['users'],
      fields: ['users.name'],
      limit: -1,
    });
    expect(negativeLimit.success).toBe(false);

    const floatLimit = QuerySchema.safeParse({
      from: ['users'],
      fields: ['users.name'],
      limit: 2.5,
    });
    expect(floatLimit.success).toBe(false);

    const zeroLimit = QuerySchema.safeParse({
      from: ['users'],
      fields: ['users.name'],
      limit: 0,
    });
    expect(zeroLimit.success).toBe(false);
  });

  it('accepts record-shaped compute', () => {
    const result = QuerySchema.safeParse({
      from: ['orders'],
      fields: ['orders.id'],
      compute: { total: { add: ['orders.price', 'orders.tax'] } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts record-shaped aggregate', () => {
    const result = QuerySchema.safeParse({
      from: ['orders'],
      fields: ['orders.userId'],
      aggregate: { count: { count: '*' } },
      groupBy: ['orders.userId'],
    });
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// Request schema
// ───────────────────────────────────────────────────────────────

describe('Request schema', () => {
  it('accepts { shape, context }', () => {
    const result = QueryRequestSchema.safeParse({
      shape: [{ id: '', name: '' }],
      context: { userId: '123' },
    });
    expect(result.success).toBe(true);
  });

  it('intent is optional', () => {
    const result = QueryRequestSchema.safeParse({
      shape: [{ id: '' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBeUndefined();
    }
  });

  it('context defaults to {}', () => {
    const result = QueryRequestSchema.safeParse({
      shape: [{ id: '' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toEqual({});
    }
  });

  it('accepts with intent', () => {
    const result = QueryRequestSchema.safeParse({
      intent: 'list active users',
      shape: [{ id: '', name: '' }],
      context: { tenantId: 't1' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe('list active users');
    }
  });
});
