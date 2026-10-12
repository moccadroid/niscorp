import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QuerySchema } from '../../src/schemas/query.schema.js';
import { FilterSchema } from '../../src/schemas/filter.schema.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';

describe('JSON Schema conversion', () => {
  it('converts the whole query DSL without unrolling the recursion', () => {
    // The assertion is that this returns: a regression exhausts the stack.
    const schema = z.toJSONSchema(QuerySchema, { io: 'input' });
    expect(schema).toBeTypeOf('object');
    expect(JSON.stringify(schema).length).toBeGreaterThan(1000);
  });

  it('converts the filter union on its own', () => {
    const schema = z.toJSONSchema(FilterSchema, { io: 'input' });
    expect(schema).toBeTypeOf('object');
  });

  it('converts the write grammar too', () => {
    const schema = z.toJSONSchema(MutationDefinitionSchema, { io: 'input' });
    expect(schema).toBeTypeOf('object');
  });

  it('emits the recursion as a $ref rather than a copy', () => {
    const json = JSON.stringify(z.toJSONSchema(FilterSchema, { io: 'input' }));
    expect(json).toContain('$ref');
  });

  it('carries every filter operator, including the recursive ones', () => {
    const json = JSON.stringify(z.toJSONSchema(FilterSchema, { io: 'input' }));
    for (const op of ['eq', 'neq', 'in', 'ilike', 'isNull', 'exists', 'and', 'or', 'not', 'optional', 'semantic', 'fuzzy']) {
      expect(json).toContain(`"${op}"`);
    }
  });
});
