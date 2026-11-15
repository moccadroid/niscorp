import { describe, it, expect } from 'vitest';
import { createQueryTools } from '../../src/agent/tools.js';
import type { Query } from '../../src/schemas/query.schema.js';

describe('a model that writes null for a tool argument it leaves out', () => {
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
