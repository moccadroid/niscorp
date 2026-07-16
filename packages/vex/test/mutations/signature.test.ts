import { describe, it, expect } from 'vitest';
import { collectMutationContext, collectQueryContext, mutationEffect, lintMutation } from '../../src/mutations/signature.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';

const field = (name: string, normalizedType = 'string', primaryKey = false) => ({
  name,
  type: normalizedType,
  normalizedType: normalizedType as 'string',
  nullable: !primaryKey,
  primaryKey,
});

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'tasks',
      table: 'tasks',
      fields: [field('id', 'string', true), field('title'), field('due_date', 'date'), field('done', 'boolean'), field('assignee_id'), field('deal_id'), field('contact_id')],
      relations: [],
      indexes: [],
    },
  ],
};

describe('collectMutationContext', () => {
  it('types keys from their column positions, notes upsert key + insert-only', () => {
    const sig = collectMutationContext(
      {
        op: 'upsert',
        table: 'tasks',
        key: 'id',
        columns: { title: { $context: 'title' }, due_date: { $context: 'due_date' } },
        insert: { deal_id: { $context: 'deal_id' } },
      },
      schema,
    );
    expect(sig['title']).toEqual({ type: 'string', column: 'tasks.title' });
    expect(sig['due_date']!.type).toBe('date');
    expect(sig['deal_id']!.note).toBe('insert only');
    expect(sig['id']!.note).toContain('upsert key');
  });

  it('reads WHERE refs with paired column types', () => {
    const sig = collectMutationContext(
      { op: 'update', table: 'tasks', set: { done: { $context: 'done' } }, where: { eq: ['tasks.id', { $context: 'id' }] } },
      schema,
    );
    expect(sig['done']).toEqual({ type: 'boolean', column: 'tasks.done' });
    expect(sig['id']).toEqual({ type: 'string', column: 'tasks.id' });
  });
});

describe('collectQueryContext', () => {
  it('pairs comparison refs with columns, recurses into subqueries, sweeps compute', () => {
    const dsl: Query = {
      from: [
        'tasks',
        { as: 't', query: { from: ['tasks'], filter: { lt: ['tasks.due_date', { $context: 'today' }] } } as Query },
      ],
      fields: ['tasks.id'],
      filter: {
        and: [
          { eq: ['tasks.assignee_id', { $context: 'userId' }] },
          { ilike: ['tasks.title', { $context: 'q' }] },
          { in: ['tasks.contact_id', { $context: 'contacts' }] },
        ],
      },
    } as Query;
    const sig = collectQueryContext(dsl, schema);
    expect(sig['userId']).toEqual({ type: 'string', column: 'tasks.assignee_id' });
    expect(sig['today']!.type).toBe('date');
    expect(sig['q']!.note).toBe('pattern');
    expect(sig['contacts']!.type).toBe('string[]');
  });
});

describe('mutationEffect', () => {
  it('summarizes op/table/columns, batches as arrays', () => {
    expect(
      mutationEffect({ op: 'upsert', table: 'tasks', key: 'id', columns: { title: { $context: 't' } }, insert: { deal_id: { $context: 'd' } } }),
    ).toEqual([{ op: 'upsert', table: 'tasks', columns: ['deal_id', 'title'] }]);
    expect(mutationEffect([{ op: 'delete', table: 'tasks', where: { eq: ['tasks.id', { $context: 'id' }] } }])).toEqual([
      { op: 'delete', table: 'tasks', columns: [] },
    ]);
  });
});

describe('lintMutation', () => {
  it('flags an update/delete whose WHERE binds no $context', () => {
    const issues = lintMutation({ op: 'delete', table: 'tasks', where: { eq: ['tasks.done', true] } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('not caller-bounded');
  });

  it('passes keyed writes and inserts', () => {
    expect(lintMutation({ op: 'delete', table: 'tasks', where: { eq: ['tasks.id', { $context: 'id' }] } })).toHaveLength(0);
    expect(lintMutation({ op: 'insert', table: 'tasks', values: { title: 'x' } })).toHaveLength(0);
  });
});
