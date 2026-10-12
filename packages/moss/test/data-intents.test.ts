import { describe, it, expect } from 'vitest';
import { compile, execute } from '@niscorp/prism';
import { createScopePolicy } from '@niscorp/vex';
import type { GenerateDsl, MapToShape } from '@niscorp/vex';
import { createIntentAnswers } from '../src/data/routes';
import type { QueryWriters } from '../src/data/routes';
import { NOTES_SCHEMA, engineDouble } from './data-double';

const READER = createScopePolicy(new Set(['notes.read']));
const NOTHING = createScopePolicy(new Set());

const world = async () => {
  const double = await engineDouble();
  const written: { intent: string | undefined; tables: string[] }[] = [];
  const generateDsl: GenerateDsl = async (request, schema) => {
    written.push({ intent: request.intent, tables: schema.entities.map((entity) => entity.name) });
    return { from: ['notes'], fields: ['notes.id', 'notes.body'] };
  };
  const mapToShape: MapToShape = async (rows) => {
    const ir = await compile({ $ref: '$.result' });
    return { ir, transformed: execute(ir, { result: JSON.parse(JSON.stringify(rows)) }) };
  };
  const writers: QueryWriters = { generateDsl, mapToShape };
  const answer = createIntentAnswers({ adapter: double.adapter, schema: NOTES_SCHEMA, cache: double.engine.cache });
  return { ...double, answer, writers, written };
};

const ASKED = { intent: 'every note', shape: [{ id: 0, body: '' }] };

describe('an intent, answered by a query written for it', () => {
  it('writes the query with the app’s writers and answers its rows', async () => {
    const { answer, writers, written } = await world();
    const answered = await answer(writers, ASKED, { policy: READER, scope: { userId: 'usr_1' } });
    expect(answered.result).toEqual([{ id: 1, body: 'first' }]);
    expect(written.map((entry) => entry.intent)).toEqual(['every note']);
  });

  it('the writer is shown only the tables the caller may read', async () => {
    const { answer, writers, written } = await world();
    await answer(writers, ASKED, { policy: READER, scope: {} });
    expect(written[0]?.tables).toEqual(['notes']);
  });

  it('a caller who may read none of it has nothing written for them', async () => {
    const { answer, writers, read } = await world();
    await expect(answer(writers, ASKED, { policy: NOTHING, scope: {} })).rejects.toThrow();
    expect(read).toEqual([]);
  });

  it('what was written is kept in the cache the routes replay from, under the fingerprint it answers with', async () => {
    const { answer, writers, engine } = await world();
    const answered = await answer(writers, ASKED, { policy: READER, scope: {} });
    const fingerprint = answered.meta.cache.fingerprint ?? '';
    expect(fingerprint).not.toBe('');
    const replayed = await engine.execute({ fingerprint, context: {} }, { locked: true, scopePolicy: READER });
    expect(replayed.result).toEqual(answered.result);
  });

  it('one engine is kept for a pair of writers, and another pair has its own', async () => {
    const { answer, writers, written } = await world();
    const other: QueryWriters = { generateDsl: async () => ({ from: ['notes'], fields: ['notes.id'] }), mapToShape: writers.mapToShape };
    await answer(writers, ASKED, { policy: READER, scope: {} });
    await answer(other, ASKED, { policy: READER, scope: {} });
    await answer(writers, ASKED, { policy: READER, scope: {} });
    // The first pair wrote twice; the second wrote through its own generateDsl.
    expect(written).toHaveLength(2);
  });
});
