import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/engine/resolver.js';
import { compileQuery } from '../../src/adapters/postgres/compile.js';
import { checkScope, scopeResolved } from '../../src/scope/apply.js';
import { discoverEntities } from '../../src/scope/discover.js';
import { FilterSchema } from '../../src/schemas/filter.schema.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';

// EXISTS — "is there a row over there that points back at this one".
//
// The questions it answers were previously two round trips: one read returning
// a flat array of ids, a second filtering with `notIn` against it. That works
// at three dozen rows and is wrong at three thousand.

const text = (name: string, nullable = false) => ({ name, type: 'text', normalizedType: 'string' as const, nullable, primaryKey: false });

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'issues',
      table: 'issues',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('status'), text('room_id', true)],
      relations: [{ type: 'belongsTo', entity: 'rooms', localField: 'room_id', foreignField: 'id' }],
      indexes: [],
    },
    {
      name: 'tasks',
      table: 'tasks',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('issue_id'), text('status')],
      relations: [{ type: 'belongsTo', entity: 'issues', localField: 'issue_id', foreignField: 'id' }],
      indexes: [],
    },
    {
      name: 'rooms',
      table: 'rooms',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('number')],
      relations: [{ type: 'hasMany', entity: 'issues', localField: 'id', foreignField: 'room_id' }],
      indexes: [],
    },
    {
      name: 'staff',
      table: 'staff',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('name')],
      relations: [],
      indexes: [],
    },
  ],
};

const sqlFor = (dsl: Query): string => compileQuery(resolve(dsl, schema)).sql;

const dispatched: Query = {
  from: ['issues'],
  fields: ['issues.id'],
  filter: { exists: { from: ['tasks'], filter: { eq: ['tasks.issue_id', 'issues.id'] } } },
};

describe('exists — the shape', () => {
  it('parses as a filter', () => {
    expect(FilterSchema.safeParse({ exists: { from: ['tasks'], filter: { eq: ['tasks.issue_id', 'issues.id'] } } }).success).toBe(true);
  });

  it('refuses anything that shapes output — it asks whether, not what', () => {
    expect(FilterSchema.safeParse({ exists: { from: ['tasks'], fields: ['tasks.id'] } }).success).toBe(false);
    expect(FilterSchema.safeParse({ exists: { from: ['tasks'], limit: 1 } }).success).toBe(false);
    expect(FilterSchema.safeParse({ exists: { from: ['tasks'], sort: [{ field: 'tasks.id', dir: 'asc' }] } }).success).toBe(false);
  });

  it('requires at least one table', () => {
    expect(FilterSchema.safeParse({ exists: { from: [] } }).success).toBe(false);
  });
});

describe('exists — compilation', () => {
  it('compiles to EXISTS (SELECT 1 ...)', () => {
    const sql = sqlFor(dispatched);
    expect(sql).toContain('EXISTS (SELECT 1 FROM tasks AS');
  });

  it('correlates on the outer alias, not the outer table name', () => {
    const sql = sqlFor(dispatched);
    const outer = /FROM issues AS (\w+)/.exec(sql)?.[1];
    const inner = /EXISTS \(SELECT 1 FROM tasks AS (\w+)/.exec(sql)?.[1];
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(inner).not.toBe(outer);
    expect(sql).toContain(`${inner!}.issue_id = ${outer!}.id`);
  });

  it('gives the inner table an alias that cannot collide with the outer one', () => {
    // Both tables start with the same letter, which is exactly when a shared
    // counter matters: a self-collision would silently correlate a table with
    // itself and match every row.
    const sql = sqlFor({
      from: ['issues'],
      fields: ['issues.id'],
      filter: { exists: { from: ['issues'], filter: { eq: ['issues.status', 'open'] } } },
    });
    const aliases = [...sql.matchAll(/issues AS (\w+)/g)].map((m) => m[1]);
    expect(aliases.length).toBe(2);
    expect(aliases[0]).not.toBe(aliases[1]);
  });

  it('wraps in NOT for NOT EXISTS, with no new vocabulary', () => {
    const sql = sqlFor({ ...dispatched, filter: { not: dispatched.filter! } });
    expect(sql).toMatch(/NOT \(EXISTS \(SELECT 1/);
  });

  it('joins inside the subquery by foreign key like anywhere else', () => {
    const sql = sqlFor({
      from: ['issues'],
      fields: ['issues.id'],
      filter: { exists: { from: ['tasks', 'issues'], filter: { eq: ['tasks.status', 'open'] } } },
    });
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM tasks AS \w+ JOIN issues AS \w+ ON/);
  });

  it('composes with the surrounding filter', () => {
    const sql = sqlFor({
      ...dispatched,
      filter: { and: [{ eq: ['issues.status', { $context: 'status' }] }, dispatched.filter!] },
    });
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('status');
  });
});

describe('exists — parameters', () => {
  it('numbers its own parameters in the parent sequence', () => {
    const compiled = compileQuery(
      resolve(
        {
          from: ['issues'],
          fields: ['issues.id'],
          filter: {
            and: [
              { eq: ['issues.status', { $context: 'outer' }] },
              { exists: { from: ['tasks'], filter: { and: [{ eq: ['tasks.issue_id', 'issues.id'] }, { eq: ['tasks.status', { $context: 'inner' }] }] } } },
            ],
          },
        },
        schema,
      ),
    );
    expect(compiled.paramSlots.map((s) => s.key)).toEqual(['outer', 'inner']);
    expect(compiled.sql).toContain('$1');
    expect(compiled.sql).toContain('$2');
  });

  it('two parameterised subqueries do not collide on $1', () => {
    // The failure this guards against: subqueries compiled independently and
    // renumbered afterwards both start at $1, so the second one silently reads
    // the first one's value.
    const compiled = compileQuery(
      resolve(
        {
          from: ['issues'],
          fields: ['issues.id'],
          filter: {
            and: [
              { exists: { from: ['tasks'], filter: { and: [{ eq: ['tasks.issue_id', 'issues.id'] }, { eq: ['tasks.status', { $context: 'first' }] }] } } },
              { exists: { from: ['staff'], filter: { eq: ['staff.name', { $context: 'second' }] } } },
            ],
          },
        },
        schema,
      ),
    );
    expect(compiled.paramSlots.map((s) => s.key)).toEqual(['first', 'second']);
    const numbers = [...compiled.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.sort()).toEqual([1, 2]);
  });
});

describe('exists — scope', () => {
  const tenant: ScopePolicy = {
    default: 'deny',
    entities: {
      issues: { read: [{ match: 'property_id', to: 'propertyId' }] },
      tasks: { read: [{ match: 'property_id', to: 'propertyId' }] },
    },
  };

  it('a table reached only through an exists is still access-checked', () => {
    const hidden: Query = {
      from: ['issues'],
      fields: ['issues.id'],
      filter: { exists: { from: ['staff'], filter: { eq: ['staff.property_id', 'issues.property_id'] } } },
    };
    // `staff` is unlisted under a default-deny policy — reaching it inside a
    // subquery must not launder it.
    expect(() => checkScope(discoverEntities(hidden), tenant)).toThrow();
  });

  it('a listed table inside an exists passes the check', () => {
    expect(() => checkScope(discoverEntities(dispatched), tenant)).not.toThrow();
  });

  it('the outer query is still row-filtered', () => {
    const resolved = resolve(dispatched, schema);
    scopeResolved(resolved, tenant);
    expect(compileQuery(resolved).sql).toContain('property_id');
  });

  it('THE TABLE INSIDE THE EXISTS IS ROW-FILTERED TOO', () => {
    // Access-checking the inner table is not enough. An EXISTS returns a
    // boolean, but a boolean about somebody else's rows is still an answer
    // about somebody else's rows — an uncorrelated exists over a scoped table
    // would report whether ANY tenant has one.
    const resolved = resolve(dispatched, schema);
    scopeResolved(resolved, tenant);
    const sql = compileQuery(resolved).sql;
    const innerAlias = /EXISTS \(SELECT 1 FROM tasks AS (\w+)/.exec(sql)?.[1];
    expect(innerAlias).toBeDefined();
    expect(sql.slice(sql.indexOf('EXISTS'))).toContain(`${innerAlias!}.property_id`);
  });

  it('an UNCORRELATED exists over a scoped table cannot see another tenant', () => {
    const oracle: Query = {
      from: ['issues'],
      fields: ['issues.id'],
      filter: { exists: { from: ['tasks'], filter: { eq: ['tasks.status', 'open'] } } },
    };
    const resolved = resolve(oracle, schema);
    scopeResolved(resolved, tenant);
    const sql = compileQuery(resolved).sql;
    const existsClause = sql.slice(sql.indexOf('EXISTS'));
    const innerAlias = /EXISTS \(SELECT 1 FROM tasks AS (\w+)/.exec(sql)?.[1];
    expect(existsClause).toContain(`${innerAlias!}.property_id`);
  });
});
