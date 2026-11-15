import { describe, it, expect } from 'vitest';
import { createQueryTools } from '../../src/agent/tools.js';
import { QuerySchema } from '../../src/schemas/query.schema.js';
import type { Query } from '../../src/schemas/query.schema.js';

describe('a model that writes null for a key it leaves out', () => {
  it('has its query read as if the key were not there', () => {
    const parsed = QuerySchema.safeParse({
      from: ['notes'],
      fields: ['notes.id'],
      filter: {
        and: [
          { semantic: { field: 'notes.embedding', query: { $context: 'q' }, minScore: null } },
          { fuzzy: { field: 'notes.title', query: { $context: 't' }, maxDistance: null } },
          { exists: { from: ['tags'], filter: null } },
        ],
      },
      compute: null,
      aggregate: null,
      groupBy: null,
      sort: [{ field: 'notes.id', dir: null }],
      limit: null,
      distinct: null,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      from: ['notes'],
      fields: ['notes.id'],
      filter: {
        and: [
          { semantic: { field: 'notes.embedding', query: { $context: 'q' } } },
          { fuzzy: { field: 'notes.title', query: { $context: 't' } } },
          { exists: { from: ['tags'] } },
        ],
      },
      sort: [{ field: 'notes.id', dir: 'asc' }],
    });
  });

  it('keeps a null that is a value', () => {
    const parsed = QuerySchema.safeParse({ from: ['notes'], fields: ['notes.id'], filter: { eq: ['notes.title', null] } });
    expect(parsed.data?.filter).toEqual({ eq: ['notes.title', null] });
  });

  it('has its testQuery call run', async () => {
    const read: Query[] = [];
    const tools = createQueryTools({
      getSchema: () => undefined,
      read: async (dsl) => {
        read.push(dsl);
        return { rows: [], sql: '', warnings: [] };
      },
    });
    const testQuery = tools.find((tool) => tool.config.id === 'testQuery');
    const context = { runId: 'r', agentId: 'a', agentPath: [], signal: new AbortController().signal, forward: () => {} };
    const result = await testQuery?.config.execute({ from: ['notes'], fields: ['notes.id'], filter: null, limit: null, distinct: null }, context);
    expect(result).toMatchObject({ errors: [] });
    expect(read).toEqual([{ from: ['notes'], fields: ['notes.id'], limit: 5 }]);
  });
});
