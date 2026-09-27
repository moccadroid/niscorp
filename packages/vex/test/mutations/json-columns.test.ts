import { describe, it, expect } from 'vitest';
import { executeMutation } from '../../src/mutations/engine.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// A value written into a json/jsonb column binds as its JSON TEXT. Handed a JS
// array, the pg driver writes a postgres ARRAY literal: `[]` arrives as '{}',
// which jsonb reads as an empty OBJECT, and a list of rows becomes a map. PGlite
// binds it the way you would expect, so nothing on PGlite shows it — found in
// production (lyceum's assistant turns, whose `opened` list came back an
// object). The bound parameters are what this checks.

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'turns',
      table: 'turns',
      fields: [
        { name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'opened', type: 'jsonb', normalizedType: 'json', nullable: false, primaryKey: false },
        { name: 'note', type: 'text', normalizedType: 'string', nullable: true, primaryKey: false },
      ],
      relations: [],
      indexes: [],
    },
  ],
};
const policy: ScopePolicy = { default: 'allow', entities: {} };

const capture = (): { client: MutationClient; params: () => unknown[] } => {
  let last: unknown[] = [];
  return {
    client: {
      query: async (_sql: string, params: unknown[] = []) => {
        last = params;
        return { rows: [{ id: 't1' }] };
      },
    },
    params: () => last,
  };
};

describe('writing into a json column', () => {
  it('an array binds as JSON text, an empty one as "[]" — never an ARRAY literal', async () => {
    const { client, params } = capture();
    await executeMutation(client, { op: 'insert', table: 'turns', values: { id: { $context: 'id' }, opened: { $context: 'opened' } } }, {
      context: { id: 't1', opened: [] },
      scope: {},
      policy,
      schema,
    });
    expect(params()).toEqual(['t1', '[]']);
  });

  it('an object too, on update, and a non-json column is left alone', async () => {
    const { client, params } = capture();
    await executeMutation(client, { op: 'update', table: 'turns', set: { opened: { $context: 'opened' }, note: { $context: 'note' } }, where: { eq: ['turns.id', { $context: 'id' }] } }, {
      context: { id: 't1', opened: [{ action: 'a', input: { x: 1 } }], note: 'plain' },
      scope: {},
      policy,
      schema,
    });
    expect(params()).toEqual(['[{"action":"a","input":{"x":1}}]', 'plain', 't1']);
  });

  it('null stays null', async () => {
    const { client, params } = capture();
    await executeMutation(client, { op: 'update', table: 'turns', set: { opened: { $context: 'opened' } }, where: { eq: ['turns.id', { $context: 'id' }] } }, {
      context: { id: 't1', opened: null },
      scope: {},
      policy,
      schema,
    });
    expect(params()).toEqual([null, 't1']);
  });
});
