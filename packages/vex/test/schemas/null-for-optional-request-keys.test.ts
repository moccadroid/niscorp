import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { seedCache } from '../../src/cache/seed.js';
import { handleQuery } from '../../src/handler.js';
import { createQueryTools } from '../../src/agent/tools.js';
import type { Query } from '../../src/schemas/query.schema.js';

const db = new PGlite();
const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }) });

beforeAll(async () => {
  await db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT);
    INSERT INTO tasks VALUES ('t1', 'first'), ('t2', 'second');`);
  await engine.introspect();
  await seedCache(engine.cache, [
    { fingerprint: 'tasks/one', dsl: { from: ['tasks'], fields: ['tasks.title'], filter: { eq: ['tasks.id', { $context: 'id' }] } }, shape: [{ title: '' }] },
  ]);
});

describe('a request that sends null for intent or fingerprint', () => {
  it('is answered by engine.execute', async () => {
    const response = await engine.execute(JSON.parse('{"fingerprint":"tasks/one","intent":null,"context":{"id":"t1"}}'));
    expect(response.result).toEqual([{ title: 'first' }]);
  });

  it('is answered by the handler', async () => {
    const answer = await handleQuery({ engine }, { fingerprint: 'tasks/one', intent: null, context: { id: 't2' } }, {});
    expect(answer).toMatchObject({ status: 200, body: { result: [{ title: 'second' }] } });
  });

  it('with a null fingerprint is read as one without it', async () => {
    const answer = await handleQuery({ engine }, { fingerprint: null, intent: 'titles' }, {});
    expect(answer).toMatchObject({ status: 400, body: { message: 'Pass a fingerprint (replay) or intent + shape (generate) — or both (named slot).' } });
  });
});

describe('testQuery with a null nested in the query', () => {
  const read: Query[] = [];
  const tools = createQueryTools({
    getSchema: () => undefined,
    read: async (dsl) => {
      read.push(dsl);
      return { rows: [{ title: 'first' }], sql: '', warnings: [] };
    },
  });
  const testQuery = tools.find((tool) => tool.config.id === 'testQuery');
  const context = { runId: 'r', agentId: 'a', agentPath: [], signal: new AbortController().signal, forward: () => {} };
  const run = (input: unknown): Promise<unknown> => Promise.resolve(testQuery?.config.execute(input, context));

  it('refuses a nested null key, so the model fixes it before its final answer', async () => {
    read.length = 0;
    const result = await run({ from: ['tasks'], fields: ['tasks.title'], sort: [{ field: 'tasks.title', dir: null }] });
    expect(result).toMatchObject({ rows: [], errors: [expect.stringContaining('sort.0.dir')] });
    expect(read).toEqual([]);
  });

  it('keeps a null that is a literal, as today', async () => {
    read.length = 0;
    const compute = { label: { case: { when: [{ condition: { eq: ['tasks.id', 't1'] }, then: null }], else: 'other' } } };
    expect(await run({ from: ['tasks'], fields: ['tasks.title'], compute, limit: null })).toMatchObject({ errors: [] });
    expect(read).toEqual([{ from: ['tasks'], fields: ['tasks.title'], compute, limit: 5 }]);
  });
});
