import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parse } from '../src/index.js';
import { buildDocument } from '../src/compile/parse.js';

describe('parse — Zod schema → field model', () => {
  it('maps each Zod type to a field kind', () => {
    const ir = parse(
      z.object({
        name: z.email(),
        age: z.int(),
        role: z.enum(['admin', 'user']),
        active: z.boolean().optional(),
      }),
    );

    if (ir.kind !== 'object') throw new Error('expected object root');
    const byKey = Object.fromEntries(ir.fields.map((f) => [f.key, f]));

    expect(byKey.name).toMatchObject({
      required: true,
      field: { kind: 'string', format: 'email' },
    });
    expect(byKey.age).toMatchObject({
      required: true,
      field: { kind: 'number', integer: true },
    });
    expect(byKey.active).toMatchObject({ required: false, field: { kind: 'boolean' } });
    expect(byKey.role!.field).toMatchObject({
      kind: 'enum',
      options: [
        { value: 'admin', label: 'admin' },
        { value: 'user', label: 'user' },
      ],
    });
  });

  it('detects integers from both z.int() and z.number().int()', () => {
    expect(parse(z.int())).toMatchObject({ kind: 'number', integer: true });
    expect(parse(z.number().int())).toMatchObject({ kind: 'number', integer: true });
    expect(parse(z.number())).not.toHaveProperty('integer');
  });

  it('unwraps optional / nullable / default to the core type', () => {
    expect(parse(z.string().optional())).toMatchObject({ kind: 'string' });
    expect(parse(z.string().nullable())).toMatchObject({ kind: 'string' });
    expect(parse(z.string().default('x'))).toMatchObject({ kind: 'string', default: 'x' });
  });

  it('reads label (meta.title) and description', () => {
    expect(parse(z.string().meta({ title: 'Name', description: 'Full name' }))).toMatchObject({
      kind: 'string',
      title: 'Name',
      description: 'Full name',
    });
  });

  it('parses an array to its element field', () => {
    expect(parse(z.array(z.string()))).toMatchObject({ kind: 'array', item: { kind: 'string' } });
    expect(parse(z.array(z.object({ name: z.string() })))).toMatchObject({
      kind: 'array',
      item: { kind: 'object' },
    });
  });

  it('parses a tuple to one field per positional slot', () => {
    const ir = parse(z.tuple([z.string(), z.number()]));
    expect(ir).toMatchObject({ kind: 'tuple', items: [{ kind: 'string' }, { kind: 'number' }] });
    // Its default is one built value per slot, fixed length.
    expect(buildDocument(ir, {})).toEqual(['', 0]);
  });

  it('distinguishes a tagged union by its tag (pattern `tag`), excluding the tag field', () => {
    const ir = parse(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('circle'), radius: z.number() }),
        z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
      ]),
    );
    if (ir.kind !== 'union') throw new Error('expected union');
    expect(ir.variants.map((v) => v.pattern)).toEqual([
      { kind: 'tag', key: 'kind', value: 'circle' },
      { kind: 'tag', key: 'kind', value: 'rect' },
    ]);

    const circle = ir.variants[0]!.field;
    if (circle.kind !== 'object') throw new Error('expected object branch');
    expect(circle.fields.map((f) => f.key)).toEqual(['radius']); // tag excluded
  });

  it('distinguishes a plain object union by key presence (pattern `key`), keeping all fields', () => {
    const ir = parse(
      z.union([z.object({ text: z.string() }), z.object({ image: z.string(), alt: z.string() })]),
    );
    if (ir.kind !== 'union') throw new Error('expected union');
    expect(ir.variants.map((v) => v.pattern)).toEqual([
      { kind: 'key', key: 'text' },
      { kind: 'key', key: 'image' }, // first key unique to the branch
    ]);

    const image = ir.variants[1]!.field;
    if (image.kind !== 'object') throw new Error('expected object branch');
    expect(image.fields.map((f) => f.key)).toEqual(['image', 'alt']); // distinguishing key stays a field
  });

  it('distinguishes a mixed union by type (pattern `type`), parsing each branch as itself', () => {
    const ir = parse(z.union([z.object({ component: z.string() }), z.string(), z.array(z.string())]));
    if (ir.kind !== 'union') throw new Error('expected union');
    expect(ir.variants.map((v) => v.pattern)).toEqual([
      { kind: 'key', key: 'component' },
      { kind: 'type', type: 'string' },
      { kind: 'type', type: 'array' },
    ]);
    // A non-object branch is edited as itself, not forced into an object.
    expect(ir.variants[1]!.field.kind).toBe('string');
    expect(ir.variants[2]!.field).toMatchObject({ kind: 'array', item: { kind: 'string' } });
  });

  it('keeps a single open branch as the fallback, bailing only when two are ambiguous', () => {
    // One branch carries a unique key (`b`), the other does not. The keyless
    // branch is the single open catch-all: a `fallback` the widget selects when
    // nothing else matches, so the union stays editable.
    const open = parse(z.union([z.object({ a: z.string(), b: z.string() }), z.object({ a: z.string() })]));
    expect(open.kind).toBe('union');
    if (open.kind !== 'union') throw new Error('expected union');
    expect(open.variants.map((v) => v.pattern)).toEqual([{ kind: 'key', key: 'b' }, { kind: 'fallback' }]);

    // Two branches, neither tellable apart: genuinely ambiguous, raw editor.
    expect(parse(z.union([z.object({ a: z.string() }), z.object({ a: z.string() })])).kind).toBe('unknown');
    expect(parse(z.unknown()).kind).toBe('unknown');
  });

  it('flattens a nested union so its members are siblings of the outer branches', () => {
    // A union of (a tagged op) and (a sub-union of primitives) flattens: the
    // primitives become typed branches alongside the op, not one opaque member.
    const ir = parse(
      z.union([z.object({ $op: z.string() }), z.union([z.string(), z.number(), z.boolean()])]),
    );
    expect(ir.kind).toBe('union');
    if (ir.kind !== 'union') throw new Error('expected union');
    expect(ir.variants.map((v) => v.pattern)).toEqual([
      { kind: 'key', key: '$op' },
      { kind: 'type', type: 'string' },
      { kind: 'type', type: 'number' },
      { kind: 'type', type: 'boolean' },
    ]);
  });

  it('terminates flattening on a union that nests back into itself', () => {
    // A self-referential union: flattening unwraps lazies, so the guard must
    // stop rather than recurse forever. The self-branch is the back-edge (a
    // `self` the fallback selects), the scalar branch keeps its type pattern.
    const Tree: z.ZodType = z.lazy(() => z.union([z.string(), Tree]));
    const ir = parse(Tree);
    expect(ir.kind).toBe('union');
    if (ir.kind !== 'union') throw new Error('expected union');
    expect(ir.variants.map((v) => ({ pattern: v.pattern.kind, field: v.field.kind }))).toEqual([
      { pattern: 'type', field: 'string' },
      { pattern: 'fallback', field: 'self' },
    ]);
  });

  it('stops a recursive schema at the cycle, tagging the object recursive', () => {
    const Comment = z.object({
      body: z.string(),
      get replies() {
        return z.array(Comment);
      },
    });
    const ir = parse(Comment);
    if (ir.kind !== 'object') throw new Error('expected object');
    // The object the cycle points back to is tagged, and expansion stops at a
    // single `self` marker — finite where the schema is not.
    expect(ir.recursive).toBe(true);
    const replies = ir.fields.find((f) => f.key === 'replies')!.field;
    expect(replies).toMatchObject({ kind: 'array', item: { kind: 'self' } });
  });

  it('peels z.lazy to reach (and detect the cycle in) the guarded schema', () => {
    const Node: z.ZodType = z.object({
      label: z.string(),
      get next() {
        return z.lazy(() => z.array(Node));
      },
    });
    const ir = parse(Node);
    if (ir.kind !== 'object') throw new Error('expected object');
    expect(ir.recursive).toBe(true);
    expect(ir.fields.find((f) => f.key === 'next')!.field).toMatchObject({
      kind: 'array',
      item: { kind: 'self' },
    });
  });
});
