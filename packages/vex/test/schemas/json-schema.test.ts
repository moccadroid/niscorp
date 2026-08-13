import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QuerySchema } from '../../src/schemas/query.schema.js';
import { FilterSchema } from '../../src/schemas/filter.schema.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';

// ═══════════════════════════════════════════════════════════════
// THE DSL AS JSON SCHEMA — `getDslSchema()`, which is how every agent-facing
// caller learns what a query may say.
//
// This file exists because of a specific escape. The filter union is
// RECURSIVE — `and`, `or`, `not` and `optional` all take a Filter — and zod
// recognises a recursive reference by INSTANCE IDENTITY. Writing
// `then: FilterSchema.describe('…')` inside the optional node handed it a
// CLONE: same shape, different object, cycle no longer visible. Conversion
// then expanded the union into itself until the stack went.
//
// Nothing in vex's own suite called the conversion, so it shipped. It surfaced
// two apps away as `Maximum call stack size exceeded` inside an unrelated
// row-level-security check, with vex in the stack and no obvious reason why.
//
// The rule the tests below hold down: a recursive slot references the schema
// BARE. Anything that returns a new instance — `.describe()`, `.optional()`,
// `.nullable()` — breaks the cycle detection at that point.
// ═══════════════════════════════════════════════════════════════

describe('JSON Schema conversion', () => {
  it('converts the whole query DSL without unrolling the recursion', () => {
    // The assertion IS that this returns. A regression does not throw a nice
    // error — it exhausts the stack, so there is nothing to catch downstream.
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
    // The positive form of the same property: a filter that appears inside a
    // filter must come back as a reference. If the conversion ever succeeds by
    // inlining to some depth instead, this catches it before the depth grows
    // enough to matter.
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
