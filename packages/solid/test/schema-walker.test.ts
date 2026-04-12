import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { walkSchema, inspectSchema, allowsUndefined } from '../src/schema-walker';

// ═══════════════════════════════════════════════════════════
// Schema walker
// ═══════════════════════════════════════════════════════════

describe('walkSchema — path traversal', () => {
  const schema = z.object({
    name: z.string(),
    count: z.number(),
    active: z.boolean(),
    tags: z.array(z.string()),
    meta: z.object({ id: z.string(), score: z.number() }),
  });

  it('resolves a top-level string field', () => {
    const info = walkSchema(schema, ['name']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
  });

  it('resolves a nested field', () => {
    const info = walkSchema(schema, ['meta', 'score']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('number');
  });

  it('resolves array element', () => {
    const info = walkSchema(schema, ['tags', '0']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
  });

  it('returns null for unknown key', () => {
    expect(walkSchema(schema, ['bogus'])).toBeNull();
  });

  it('returns null for nested unknown key', () => {
    expect(walkSchema(schema, ['meta', 'bogus'])).toBeNull();
  });

  it('resolves root path', () => {
    const info = walkSchema(schema, []);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('object');
  });
});

describe('walkSchema — ZodEnum', () => {
  const schema = z.object({ status: z.enum(['active', 'inactive', 'pending']) });

  it('accepts string kind for enum', () => {
    const info = walkSchema(schema, ['status']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
    expect(info!.acceptedKinds).not.toContain('number');
  });
});

describe('walkSchema — ZodLiteral', () => {
  const schema = z.object({ type: z.literal('card') });

  it('accepts string kind for string literal', () => {
    const info = walkSchema(schema, ['type']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
  });
});

describe('walkSchema — ZodRecord', () => {
  const schema = z.object({ data: z.record(z.string(), z.number()) });

  it('accepts any string key', () => {
    const info = walkSchema(schema, ['data', 'anything']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('number');
  });
});

describe('walkSchema — ZodTuple', () => {
  const schema = z.object({ pair: z.tuple([z.string(), z.number()]) });

  it('resolves positional types', () => {
    const info0 = walkSchema(schema, ['pair', '0']);
    expect(info0).not.toBeNull();
    expect(info0!.acceptedKinds).toContain('string');

    const info1 = walkSchema(schema, ['pair', '1']);
    expect(info1).not.toBeNull();
    expect(info1!.acceptedKinds).toContain('number');
  });

  it('returns null for out-of-bounds index without rest', () => {
    expect(walkSchema(schema, ['pair', '2'])).toBeNull();
  });
});

describe('walkSchema — optional / nullable / default', () => {
  const schema = z.object({
    opt: z.string().optional(),
    nul: z.string().nullable(),
    def: z.string().default('hello'),
  });

  it('unwraps optional to string', () => {
    const info = walkSchema(schema, ['opt']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
  });

  it('nullable includes null', () => {
    const info = walkSchema(schema, ['nul']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
    expect(info!.acceptedKinds).toContain('null');
  });

  it('unwraps default to string', () => {
    const info = walkSchema(schema, ['def']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
  });
});

describe('walkSchema — ZodUnion', () => {
  const schema = z.object({ field: z.union([z.string(), z.number()]) });

  it('accepts all union variants', () => {
    const info = walkSchema(schema, ['field']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
    expect(info!.acceptedKinds).toContain('number');
  });
});

describe('walkSchema — ZodDiscriminatedUnion', () => {
  const schema = z.object({
    item: z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), content: z.string() }),
      z.object({ type: z.literal('image'), url: z.string(), width: z.number() }),
    ]),
  });

  it('resolves discriminator field', () => {
    const info = walkSchema(schema, ['item', 'type']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('string');
  });

  it('resolves fields from either variant', () => {
    const content = walkSchema(schema, ['item', 'content']);
    expect(content).not.toBeNull();
    expect(content!.acceptedKinds).toContain('string');

    const width = walkSchema(schema, ['item', 'width']);
    expect(width).not.toBeNull();
    expect(width!.acceptedKinds).toContain('number');
  });

  it('returns null for unknown field across all variants', () => {
    expect(walkSchema(schema, ['item', 'bogus'])).toBeNull();
  });

  it('inspects discriminated union as object kind', () => {
    const info = walkSchema(schema, ['item']);
    expect(info).not.toBeNull();
    expect(info!.acceptedKinds).toContain('object');
  });
});

describe('inspectSchema', () => {
  it('returns "any" for ZodAny', () => {
    const info = inspectSchema(z.any());
    expect(info.acceptedKinds).toBe('any');
  });
});

describe('allowsUndefined', () => {
  it('optional allows undefined', () => {
    expect(allowsUndefined(z.string().optional())).toBe(true);
  });

  it('non-optional does not', () => {
    expect(allowsUndefined(z.string())).toBe(false);
  });

  it('default allows undefined', () => {
    expect(allowsUndefined(z.string().default('x'))).toBe(true);
  });
});
