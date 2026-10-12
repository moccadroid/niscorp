import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/engine/resolver.js';
import { checkScope, scopeResolved } from '../../src/scope/apply.js';
import { compileQuery } from '../../src/adapters/postgres/compile.js';
import { discoverEntities } from '../../src/scope/discover.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';

const text = (name: string, nullable = false) => ({ name, type: 'text', normalizedType: 'string' as const, nullable, primaryKey: false });

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'issues',
      table: 'issues',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('room_id', true), text('summary')],
      relations: [{ type: 'belongsTo', entity: 'rooms', localFields: ['room_id'], foreignFields: ['id'] }],
      indexes: [],
    },
    {
      name: 'rooms',
      table: 'rooms',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('number')],
      relations: [{ type: 'hasMany', entity: 'issues', localFields: ['id'], foreignFields: ['room_id'] }],
      indexes: [],
    },
    {
      name: 'tasks',
      table: 'tasks',
      fields: [{ ...text('id'), primaryKey: true }, text('property_id'), text('issue_id')],
      relations: [{ type: 'belongsTo', entity: 'issues', localFields: ['issue_id'], foreignFields: ['id'] }],
      indexes: [],
    },
  ],
};

const tenant: ScopePolicy = {
  default: 'allow',
  entities: {
    issues: { read: [{ match: 'property_id', to: 'propertyId' }] },
    rooms: { read: [{ match: 'property_id', to: 'propertyId' }] },
    tasks: { read: [{ match: 'property_id', to: 'propertyId' }] },
  },
};

const sqlFor = (dsl: Query, policy: ScopePolicy = tenant): string => {
  checkScope(discoverEntities(dsl), policy);
  const resolved = resolve(dsl, schema);
  scopeResolved(resolved, policy);
  return compileQuery(resolved).sql;
};

describe('scope placement — a row rule on a LEFT join', () => {
  const withRoom: Query = {
    from: ['issues', 'rooms'],
    fields: [{ field: 'issues.id', as: 'issue_id' }, { field: 'rooms.number', as: 'room_number' }],
    filter: { eq: ['issues.id', { $context: 'issueId' }] },
  };

  it('the join is LEFT, because the foreign key is nullable', () => {
    expect(sqlFor(withRoom)).toContain('LEFT JOIN rooms');
  });

  it("goes in the join's ON clause, not in WHERE", () => {
    const sql = sqlFor(withRoom);
    expect(sql).toMatch(/LEFT JOIN rooms AS \w+ ON \w+\.room_id = \w+\.id AND \w+\.property_id = \$\d+/);
  });

  it('...so an issue with no room is not filtered out by the room rule', () => {
    const sql = sqlFor(withRoom);
    const where = sql.slice(sql.indexOf('WHERE'));
    const roomAlias = /LEFT JOIN rooms AS (\w+)/.exec(sql)?.[1];
    expect(roomAlias).toBeDefined();
    expect(where).not.toContain(`${roomAlias!}.property_id`);
  });

  it('the driving table keeps its own rule in WHERE', () => {
    const sql = sqlFor(withRoom);
    const issueAlias = /FROM issues AS (\w+)/.exec(sql)?.[1];
    expect(sql.slice(sql.indexOf('WHERE'))).toContain(`${issueAlias!}.property_id`);
  });

  it('the tenant boundary is still enforced — the rule exists, it just moved', () => {
    const sql = sqlFor(withRoom);
    expect(sql.match(/property_id = \$\d+/g)?.length).toBe(2);
  });
});

describe('scope placement — a row rule on an INNER join', () => {
  const withTasks: Query = {
    from: ['issues', 'tasks'],
    fields: [{ field: 'issues.id', as: 'issue_id' }, { field: 'tasks.id', as: 'task_id' }],
  };

  it('stays in WHERE, because an inner join drops the row either way', () => {
    const sql = sqlFor(withTasks);
    expect(sql).toContain('JOIN tasks');
    expect(sql).not.toContain('LEFT JOIN tasks');
    const taskAlias = /JOIN tasks AS (\w+)/.exec(sql)?.[1];
    expect(sql.slice(sql.indexOf('WHERE'))).toContain(`${taskAlias!}.property_id`);
  });
});

describe('scope placement — the rest of the contract still holds', () => {
  it('an unscoped policy adds nothing', () => {
    const sql = sqlFor({ from: ['issues'], fields: ['issues.id'] }, { default: 'allow', entities: {} });
    expect(sql).not.toContain('property_id');
  });

  it('a denied entity is refused before any SQL is written', () => {
    const policy: ScopePolicy = { default: 'allow', entities: { rooms: { deny: true } } };
    expect(() => sqlFor({ from: ['issues', 'rooms'], fields: ['issues.id'] }, policy)).toThrow();
  });

  it('a rule naming a column the table does not have fails closed', () => {
    const policy: ScopePolicy = { default: 'allow', entities: { issues: { read: [{ match: 'nonexistent', to: 'x' }] } } };
    expect(() => sqlFor({ from: ['issues'], fields: ['issues.id'] }, policy)).toThrow(/does not have/);
  });

  it('a rule lands inside the subquery whose FROM reads the table', () => {
    const sql = sqlFor({
      from: [{ as: 'sub', query: { from: ['tasks'], fields: [{ field: 'tasks.issue_id', as: 'issue_id' }] } }],
      fields: ['sub.issue_id'],
    });
    expect(sql).toContain('property_id');
  });

  it('several matches on one entity all land', () => {
    const policy: ScopePolicy = {
      default: 'allow',
      entities: { issues: { read: [{ match: 'property_id', to: 'propertyId' }, { match: 'summary', to: 'needle' }] } },
    };
    const sql = sqlFor({ from: ['issues'], fields: ['issues.id'] }, policy);
    expect(sql).toContain('property_id');
    expect(sql).toContain('summary');
  });
});
