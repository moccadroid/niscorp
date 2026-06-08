import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/engine/resolver.js';
import { analyze } from '../../src/engine/analyzer.js';
import { compileQuery } from '../../src/adapters/postgres/compile.js';
import { VexError } from '../../src/errors.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { AnalysisConfig } from '../../src/engine/engine.types.js';

// ═══════════════════════════════════════════════════════════════
// Test schema fixture
// ═══════════════════════════════════════════════════════════════

const createTestSchema = (): DatabaseSchema => ({
  entities: [
    {
      name: 'customers',
      table: 'customers',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'name', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'email', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
      ],
      relations: [
        { type: 'hasMany', entity: 'orders', localField: 'id', foreignField: 'customer_id' },
      ],
      indexes: [
        { name: 'customers_pkey', fields: ['id'], type: 'btree', unique: true },
      ],
    },
    {
      name: 'orders',
      table: 'orders',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'customer_id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'status', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'total', type: 'numeric', normalizedType: 'number', nullable: false, primaryKey: false },
        { name: 'created_at', type: 'timestamptz', normalizedType: 'timestamp', nullable: false, primaryKey: false },
      ],
      relations: [
        { type: 'belongsTo', entity: 'customers', localField: 'customer_id', foreignField: 'id' },
        { type: 'hasMany', entity: 'order_items', localField: 'id', foreignField: 'order_id' },
      ],
      indexes: [
        { name: 'orders_pkey', fields: ['id'], type: 'btree', unique: true },
        { name: 'orders_customer_id_idx', fields: ['customer_id'], type: 'btree', unique: false },
        { name: 'orders_status_idx', fields: ['status'], type: 'btree', unique: false },
      ],
    },
    {
      name: 'order_items',
      table: 'order_items',
      fields: [
        { name: 'id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'order_id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'product_name', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'quantity', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: false },
        { name: 'unit_price', type: 'numeric', normalizedType: 'number', nullable: false, primaryKey: false },
      ],
      relations: [
        { type: 'belongsTo', entity: 'orders', localField: 'order_id', foreignField: 'id' },
      ],
      indexes: [
        { name: 'order_items_pkey', fields: ['id'], type: 'btree', unique: true },
        { name: 'order_items_order_id_idx', fields: ['order_id'], type: 'btree', unique: false },
      ],
    },
  ],
});

const defaultAnalysisConfig: AnalysisConfig = {
  maxNestingDepth: 3,
  rejectCartesianProducts: false,
  warnUnindexedFilters: true,
  rejectUnindexedFilters: false,
};

// ═══════════════════════════════════════════════════════════════
// Resolver
// ═══════════════════════════════════════════════════════════════

describe('Resolver', () => {
  const schema = createTestSchema();

  describe('single-entity queries', () => {
    it('resolves a simple query with one field and one source', () => {
      const dsl: Query = {
        from: ['customers'],
        fields: ['customers.name'],
      };

      const result = resolve(dsl, schema);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.alias).toBe('c1');
      expect(result.sources[0]?.table).toBe('customers');
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]?.path).toBe('customers.name');
      expect(result.fields[0]?.alias).toBe('c1');
      expect(result.fields[0]?.column).toBe('name');
      expect(result.fields[0]?.outputName).toBe('name');
      expect(result.joins).toHaveLength(0);
    });

    it('resolves multiple fields from the same entity', () => {
      const dsl: Query = {
        from: ['customers'],
        fields: ['customers.id', 'customers.name', 'customers.email'],
      };

      const result = resolve(dsl, schema);

      expect(result.fields).toHaveLength(3);
      expect(result.fields.map((f) => f.column)).toEqual(['id', 'name', 'email']);
      // All fields share the same alias
      const aliases = new Set(result.fields.map((f) => f.alias));
      expect(aliases.size).toBe(1);
    });
  });

  describe('multi-entity queries with automatic join discovery', () => {
    it('resolves a two-entity query with automatic join via FK relation', () => {
      const dsl: Query = {
        from: ['orders', 'customers'],
        fields: ['orders.id', 'customers.name'],
      };

      const result = resolve(dsl, schema);

      expect(result.sources).toHaveLength(2);
      expect(result.joins).toHaveLength(1);

      const join = result.joins[0];
      expect(join).toBeDefined();
      // orders.customer_id -> customers.id (orders belongsTo customers)
      expect(join?.fromColumn).toBe('customer_id');
      expect(join?.toColumn).toBe('id');
      expect(join?.toTable).toBe('customers');
    });

    it('resolves a three-entity query chaining joins', () => {
      const dsl: Query = {
        from: ['customers', 'orders', 'order_items'],
        fields: ['customers.name', 'orders.status', 'order_items.product_name'],
      };

      const result = resolve(dsl, schema);

      expect(result.sources).toHaveLength(3);
      expect(result.joins).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('throws for an unknown entity name with a suggestion', () => {
      const dsl: Query = {
        from: ['custmers'],
        fields: ['custmers.name'],
      };

      expect(() => resolve(dsl, schema)).toThrow(VexError);
      try {
        resolve(dsl, schema);
      } catch (err) {
        expect(err).toBeInstanceOf(VexError);
        const vexErr = err as InstanceType<typeof VexError>;
        expect(vexErr.message).toContain('custmers');
        expect(vexErr.message).toContain('Did you mean');
        expect(vexErr.message).toContain('customers');
      }
    });

    it('throws for an unknown field name on a known entity', () => {
      const dsl: Query = {
        from: ['customers'],
        fields: ['customers.phone'],
      };

      expect(() => resolve(dsl, schema)).toThrow(VexError);
      try {
        resolve(dsl, schema);
      } catch (err) {
        expect(err).toBeInstanceOf(VexError);
        const vexErr = err as InstanceType<typeof VexError>;
        expect(vexErr.message).toContain('phone');
        expect(vexErr.message).toContain('customers');
      }
    });

    it('throws for an invalid field path without a dot', () => {
      const dsl: Query = {
        from: ['customers'],
        fields: ['name'],
      };

      expect(() => resolve(dsl, schema)).toThrow(VexError);
    });
  });

  describe('filter resolution', () => {
    it('resolves filters with $context references into param paths', () => {
      const dsl: Query = {
        from: ['orders'],
        fields: ['orders.id', 'orders.status'],
        filter: { eq: ['orders.status', { $context: 'statusFilter' }] },
      };

      const result = resolve(dsl, schema);

      expect(result.filter).toBeDefined();
      expect(result.filter?.original).toEqual(dsl.filter);
      // The field path orders.status should be resolved in resolvedPaths
      expect(result.filter?.resolvedPaths.has('orders.status')).toBe(true);
      const resolved = result.filter?.resolvedPaths.get('orders.status');
      expect(resolved?.alias).toBe('o1');
      expect(resolved?.column).toBe('status');
    });

    it('resolves filters with $scope references', () => {
      const dsl: Query = {
        from: ['orders'],
        fields: ['orders.id'],
        filter: { eq: ['orders.customer_id', { $scope: 'tenantCustomerId' }] },
      };

      const result = resolve(dsl, schema);

      expect(result.filter?.resolvedPaths.has('orders.customer_id')).toBe(true);
    });

    it('resolves compound filters with and/or', () => {
      const dsl: Query = {
        from: ['orders'],
        fields: ['orders.id'],
        filter: {
          and: [
            { eq: ['orders.status', 'active'] },
            { gt: ['orders.total', 100] },
          ],
        },
      };

      const result = resolve(dsl, schema);

      expect(result.filter?.resolvedPaths.has('orders.status')).toBe(true);
      expect(result.filter?.resolvedPaths.has('orders.total')).toBe(true);
    });
  });

  describe('computed fields', () => {
    it('resolves computed fields and populates aliasMap', () => {
      const dsl: Query = {
        from: ['order_items'],
        fields: ['order_items.product_name'],
        compute: {
          line_total: { multiply: ['order_items.quantity', 'order_items.unit_price'] },
        },
      };

      const result = resolve(dsl, schema);

      expect(result.computes).toHaveLength(1);
      expect(result.computes[0]?.name).toBe('line_total');
      // The paths used in compute should be added to aliasMap
      expect(result.aliasMap.has('order_items.quantity')).toBe(true);
      expect(result.aliasMap.has('order_items.unit_price')).toBe(true);
    });
  });

  describe('aggregate fields', () => {
    it('resolves aggregate fields with groupBy', () => {
      const dsl: Query = {
        from: ['orders'],
        fields: ['orders.status'],
        aggregate: {
          order_count: { count: '*' },
          total_amount: { sum: 'orders.total' },
        },
        groupBy: ['orders.status'],
      };

      const result = resolve(dsl, schema);

      expect(result.aggregates).toHaveLength(2);
      expect(result.aggregates[0]?.name).toBe('order_count');
      expect(result.aggregates[1]?.name).toBe('total_amount');
      expect(result.groupBy).toHaveLength(1);
      expect(result.groupBy[0]?.column).toBe('status');
      // sum path should be in aliasMap
      expect(result.aliasMap.has('orders.total')).toBe(true);
    });
  });

  describe('subqueries', () => {
    it('resolves subquery sources with synthetic entity lookup', () => {
      const dsl: Query = {
        from: [
          {
            as: 'sub',
            query: {
              from: ['orders'],
              fields: ['orders.customer_id', 'orders.total'],
            },
          },
        ],
        fields: ['sub.customer_id', 'sub.total'],
      };

      const result = resolve(dsl, schema);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.subquery).toBeDefined();
      expect(result.sources[0]?.alias).toBe('sub');
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]?.alias).toBe('sub');
    });
  });

  describe('sort', () => {
    it('resolves sort on a regular field', () => {
      const dsl: Query = {
        from: ['orders'],
        fields: ['orders.id', 'orders.total'],
        sort: [{ field: 'orders.total', dir: 'desc' }],
      };

      const result = resolve(dsl, schema);

      expect(result.sort).toHaveLength(1);
      expect(result.sort[0]?.dir).toBe('desc');
      expect(typeof result.sort[0]?.field).not.toBe('string');
    });

    it('resolves sort on a computed field by alias name', () => {
      const dsl: Query = {
        from: ['order_items'],
        fields: ['order_items.product_name'],
        compute: {
          line_total: { multiply: ['order_items.quantity', 'order_items.unit_price'] },
        },
        sort: [{ field: 'line_total', dir: 'desc' }],
      };

      const result = resolve(dsl, schema);

      expect(result.sort).toHaveLength(1);
      // Computed field sorts are stored as string aliases, not ResolvedField
      expect(result.sort[0]?.field).toBe('line_total');
      expect(result.sort[0]?.dir).toBe('desc');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Analyzer
// ═══════════════════════════════════════════════════════════════

describe('Analyzer', () => {
  const schema = createTestSchema();

  it('returns no errors or warnings for a simple valid resolved query', () => {
    const dsl: Query = {
      from: ['customers'],
      fields: ['customers.id', 'customers.name'],
    };
    const resolved = resolve(dsl, schema);
    const result = analyze(resolved, defaultAnalysisConfig);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns error when nesting depth exceeds the limit', () => {
    // Create a deeply nested subquery: level 0 -> level 1 -> level 2
    const dsl: Query = {
      from: [
        {
          as: 'level1',
          query: {
            from: [
              {
                as: 'level2',
                query: {
                  from: ['orders'],
                  fields: ['orders.id', 'orders.total'],
                },
              },
            ],
            fields: ['level2.id', 'level2.total'],
          },
        },
      ],
      fields: ['level1.id', 'level1.total'],
    };

    const resolved = resolve(dsl, schema);
    const strictConfig: AnalysisConfig = {
      ...defaultAnalysisConfig,
      maxNestingDepth: 1,
    };
    const result = analyze(resolved, strictConfig);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('nesting depth'))).toBe(true);
  });

  it('returns error for cartesian product when rejectCartesianProducts is true', () => {
    // Manually construct a resolved query with two entity sources but no joins
    const dsl: Query = {
      from: ['customers'],
      fields: ['customers.id'],
    };
    const resolved = resolve(dsl, schema);

    // Inject a second entity source without a join to simulate cartesian product
    const ordersEntity = schema.entities.find((e) => e.name === 'orders');
    resolved.sources.push({
      alias: 'o1',
      entity: ordersEntity,
      table: 'orders',
    });

    const cartesianConfig: AnalysisConfig = {
      ...defaultAnalysisConfig,
      rejectCartesianProducts: true,
    };
    const result = analyze(resolved, cartesianConfig);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.toLowerCase().includes('cartesian'))).toBe(true);
  });

  it('returns warning for aggregate without groupBy', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      aggregate: {
        total_orders: { count: '*' },
      },
    };

    const resolved = resolve(dsl, schema);
    const result = analyze(resolved, defaultAnalysisConfig);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('aggregate'))).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes('groupby'))).toBe(true);
  });

  it('returns no aggregate warning when groupBy is present', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.status'],
      aggregate: {
        total_orders: { count: '*' },
      },
      groupBy: ['orders.status'],
    };

    const resolved = resolve(dsl, schema);
    const result = analyze(resolved, defaultAnalysisConfig);

    const aggWarnings = result.warnings.filter((w) => w.toLowerCase().includes('aggregate'));
    expect(aggWarnings).toHaveLength(0);
  });

  it('warns about unindexed filter columns when warnUnindexedFilters is true', () => {
    const dsl: Query = {
      from: ['customers'],
      fields: ['customers.id'],
      filter: { eq: ['customers.name', 'Alice'] },
    };

    const resolved = resolve(dsl, schema);
    const result = analyze(resolved, defaultAnalysisConfig);

    // customers.name is not in any index
    expect(result.warnings.some((w) => w.toLowerCase().includes('unindexed'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Compiler
// ═══════════════════════════════════════════════════════════════

describe('Compiler', () => {
  const schema = createTestSchema();

  it('compiles a simple resolved query to valid SQL with SELECT/FROM', () => {
    const dsl: Query = {
      from: ['customers'],
      fields: ['customers.id', 'customers.name'],
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('SELECT');
    expect(compiled.sql).toContain('c1.id AS "id"');
    expect(compiled.sql).toContain('c1.name AS "name"');
    expect(compiled.sql).toContain('FROM customers AS c1');
    expect(compiled.paramSlots).toHaveLength(0);
  });

  it('compiles joins into JOIN ... ON clauses', () => {
    const dsl: Query = {
      from: ['orders', 'customers'],
      fields: ['orders.id', 'customers.name'],
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('JOIN customers AS c1');
    expect(compiled.sql).toContain('ON');
    expect(compiled.sql).toContain('customer_id');
  });

  it('compiles WHERE clause from filter', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      filter: { eq: ['orders.status', 'active'] },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('WHERE');
    expect(compiled.sql).toContain("o1.status = 'active'");
  });

  it('compiles $context refs into parameterized $N placeholders', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      filter: { eq: ['orders.status', { $context: 'statusFilter' }] },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('$1');
    expect(compiled.paramSlots).toHaveLength(1);
    expect(compiled.paramSlots[0]?.key).toBe('statusFilter');
    expect(compiled.paramSlots[0]?.kind).toBe('context');
  });

  it('compiles multiple $context refs with incrementing $N placeholders', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      filter: {
        and: [
          { eq: ['orders.status', { $context: 'statusFilter' }] },
          { gt: ['orders.total', { $context: 'minTotal' }] },
        ],
      },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('$1');
    expect(compiled.sql).toContain('$2');
    expect(compiled.paramSlots).toHaveLength(2);
    expect(compiled.paramSlots[0]?.key).toBe('statusFilter');
    expect(compiled.paramSlots[1]?.key).toBe('minTotal');
  });

  it('compiles computed expressions to SQL (multiply)', () => {
    const dsl: Query = {
      from: ['order_items'],
      fields: ['order_items.product_name'],
      compute: {
        line_total: { multiply: ['order_items.quantity', 'order_items.unit_price'] },
      },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('AS "line_total"');
    // The multiply expression compiles to (a * b)
    expect(compiled.sql).toContain('*');
    expect(compiled.sql).toContain('o1.quantity');
    expect(compiled.sql).toContain('o1.unit_price');
  });

  it('compiles computed concat expression to SQL', () => {
    const dsl: Query = {
      from: ['customers'],
      fields: ['customers.id'],
      compute: {
        greeting: { concat: ['customers.name', ' <', 'customers.email', '>'] },
      },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('||');
    expect(compiled.sql).toContain('AS "greeting"');
  });

  it('compiles computed coalesce expression to SQL', () => {
    const dsl: Query = {
      from: ['customers'],
      fields: ['customers.id'],
      compute: {
        display_name: { coalesce: ['customers.name', 'customers.email'] },
      },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('COALESCE(');
    expect(compiled.sql).toContain('AS "display_name"');
  });

  it('compiles aggregate expressions (COUNT, SUM, AVG)', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.status'],
      aggregate: {
        order_count: { count: '*' },
        total_revenue: { sum: 'orders.total' },
        avg_order: { avg: 'orders.total' },
      },
      groupBy: ['orders.status'],
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('COUNT(*)');
    expect(compiled.sql).toContain('SUM(');
    expect(compiled.sql).toContain('AVG(');
    expect(compiled.sql).toContain('AS "order_count"');
    expect(compiled.sql).toContain('AS "total_revenue"');
    expect(compiled.sql).toContain('AS "avg_order"');
  });

  it('compiles GROUP BY clause', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.status'],
      aggregate: { order_count: { count: '*' } },
      groupBy: ['orders.status'],
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('GROUP BY o1.status');
  });

  it('compiles ORDER BY clause', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id', 'orders.total'],
      sort: [
        { field: 'orders.total', dir: 'desc' },
        { field: 'orders.created_at', dir: 'asc' },
      ],
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('ORDER BY');
    expect(compiled.sql).toContain('o1.total DESC');
    expect(compiled.sql).toContain('o1.created_at ASC');
  });

  it('compiles ORDER BY for computed field aliases', () => {
    const dsl: Query = {
      from: ['order_items'],
      fields: ['order_items.product_name'],
      compute: {
        line_total: { multiply: ['order_items.quantity', 'order_items.unit_price'] },
      },
      sort: [{ field: 'line_total', dir: 'desc' }],
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('ORDER BY "line_total" DESC');
  });

  it('compiles LIMIT clause', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      limit: 25,
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toContain('LIMIT 25');
  });

  it('compiles DISTINCT keyword', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.status'],
      distinct: true,
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.sql).toMatch(/SELECT\s+DISTINCT/);
  });

  it('generates correct contextContract from paramSlots', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.id'],
      filter: {
        and: [
          { eq: ['orders.status', { $context: 'statusFilter' }] },
          { eq: ['orders.customer_id', { $scope: 'tenantCustomer' }] },
        ],
      },
    };
    const resolved = resolve(dsl, schema);
    const compiled = compileQuery(resolved);

    expect(compiled.contextContract['statusFilter']).toBeDefined();
    expect(compiled.contextContract['statusFilter']?.kind).toBe('context');
    expect(compiled.contextContract['tenantCustomer']).toBeDefined();
    expect(compiled.contextContract['tenantCustomer']?.kind).toBe('scope');
  });
});

// ═══════════════════════════════════════════════════════════════
// Full pipeline (resolve -> analyze -> compile)
// ═══════════════════════════════════════════════════════════════

describe('Full pipeline', () => {
  const schema = createTestSchema();

  it('handles a realistic e-commerce query: orders with customer name, filtered by status', () => {
    const dsl: Query = {
      from: ['orders', 'customers'],
      fields: ['orders.id', 'orders.total', 'customers.name'],
      filter: { eq: ['orders.status', { $context: 'statusFilter' }] },
      sort: [{ field: 'orders.created_at', dir: 'desc' }],
      limit: 50,
    };

    const resolved = resolve(dsl, schema);
    const analysis = analyze(resolved, defaultAnalysisConfig);
    const compiled = compileQuery(resolved);

    // Analysis should pass cleanly
    expect(analysis.errors).toHaveLength(0);

    // SQL should contain all expected clauses
    expect(compiled.sql).toContain('SELECT');
    expect(compiled.sql).toContain('o1.id AS "id"');
    expect(compiled.sql).toContain('o1.total AS "total"');
    expect(compiled.sql).toContain('c1.name AS "name"');
    expect(compiled.sql).toContain('FROM orders AS o1');
    expect(compiled.sql).toContain('JOIN customers AS c1');
    expect(compiled.sql).toContain('ON');
    expect(compiled.sql).toContain('WHERE');
    expect(compiled.sql).toContain('$1');
    expect(compiled.sql).toContain('ORDER BY');
    expect(compiled.sql).toContain('LIMIT 50');

    // Param slot should reference the context filter
    expect(compiled.paramSlots).toHaveLength(1);
    expect(compiled.paramSlots[0]?.key).toBe('statusFilter');
  });

  it('handles a query with compute: total = quantity * unit_price', () => {
    const dsl: Query = {
      from: ['order_items'],
      fields: ['order_items.product_name', 'order_items.quantity', 'order_items.unit_price'],
      compute: {
        total: { multiply: ['order_items.quantity', 'order_items.unit_price'] },
      },
      sort: [{ field: 'total', dir: 'desc' }],
    };

    const resolved = resolve(dsl, schema);
    const analysis = analyze(resolved, defaultAnalysisConfig);
    const compiled = compileQuery(resolved);

    expect(analysis.errors).toHaveLength(0);

    expect(compiled.sql).toContain('AS "total"');
    expect(compiled.sql).toContain('ORDER BY "total" DESC');
    expect(compiled.sql).toContain('FROM order_items AS o1');
    expect(compiled.paramSlots).toHaveLength(0);
  });

  it('handles a query with aggregate: count orders grouped by status', () => {
    const dsl: Query = {
      from: ['orders'],
      fields: ['orders.status'],
      aggregate: {
        order_count: { count: '*' },
        total_revenue: { sum: 'orders.total' },
      },
      groupBy: ['orders.status'],
      sort: [{ field: 'order_count', dir: 'desc' }],
    };

    const resolved = resolve(dsl, schema);
    const analysis = analyze(resolved, defaultAnalysisConfig);
    const compiled = compileQuery(resolved);

    expect(analysis.errors).toHaveLength(0);
    // No aggregate-without-groupBy warning because groupBy is provided
    expect(analysis.warnings.filter((w) => w.includes('groupBy'))).toHaveLength(0);

    expect(compiled.sql).toContain('COUNT(*)');
    expect(compiled.sql).toContain('SUM(');
    expect(compiled.sql).toContain('GROUP BY o1.status');
    expect(compiled.sql).toContain('ORDER BY "order_count" DESC');
    expect(compiled.paramSlots).toHaveLength(0);
  });

  it('produces well-formed SQL for a multi-table join with filter, compute, and limit', () => {
    const dsl: Query = {
      from: ['orders', 'order_items'],
      fields: ['orders.id', 'order_items.product_name'],
      compute: {
        line_total: { multiply: ['order_items.quantity', 'order_items.unit_price'] },
      },
      filter: { gt: ['order_items.quantity', 5] },
      sort: [{ field: 'line_total', dir: 'desc' }],
      limit: 10,
    };

    const resolved = resolve(dsl, schema);
    const analysis = analyze(resolved, defaultAnalysisConfig);
    const compiled = compileQuery(resolved);

    expect(analysis.errors).toHaveLength(0);

    // Verify SQL structure order: SELECT ... FROM ... JOIN ... WHERE ... ORDER BY ... LIMIT
    const selectIdx = compiled.sql.indexOf('SELECT');
    const fromIdx = compiled.sql.indexOf('FROM');
    const joinIdx = compiled.sql.indexOf('JOIN');
    const whereIdx = compiled.sql.indexOf('WHERE');
    const orderIdx = compiled.sql.indexOf('ORDER BY');
    const limitIdx = compiled.sql.indexOf('LIMIT');

    expect(selectIdx).toBeLessThan(fromIdx);
    expect(fromIdx).toBeLessThan(joinIdx);
    expect(joinIdx).toBeLessThan(whereIdx);
    expect(whereIdx).toBeLessThan(orderIdx);
    expect(orderIdx).toBeLessThan(limitIdx);
  });
});
