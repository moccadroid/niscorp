import { describe, it, expect } from 'vitest';
import { buildSyntheticParams } from '../../src/agent/tools.js';
import type { CompiledQuery, ParamSlot } from '../../src/adapters/adapter.types.js';

// testQuery executes drafts with synthetic params. They MUST be NULL:
// a comparison against a column of any type is valid SQL with NULL
// (Postgres infers the type from the column side). Typed guesses were a
// trap — '' bound against a date/uuid column is a CAST ERROR, which made
// the query agent conclude the DSL "does not support" date-context
// comparisons and negative-cache a perfectly satisfiable request.

const compiled = (types: string[]): CompiledQuery => ({
  sql: 'SELECT 1',
  // `key`, not `name` — a ParamSlot is keyed by the context key it binds, and
  // the field has never been called `name`.
  paramSlots: types.map((type, index) => ({
    key: `p${index}`,
    kind: 'context' as const,
    type: type as ParamSlot['type'],
  })),
  contextContract: {},
});

describe('buildSyntheticParams', () => {
  it('binds NULL for every slot regardless of declared type', () => {
    const params = buildSyntheticParams(compiled(['string', 'number', 'boolean', 'string[]', 'number[]']));
    expect(params).toEqual([null, null, null, null, null]);
  });

  it('no slots → no params', () => {
    expect(buildSyntheticParams(compiled([]))).toEqual([]);
  });
});
