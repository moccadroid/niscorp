import { describe, it, expect } from 'vitest';
import { ConfigSchema, validate } from '../src/index';
import { PRISM_EXAMPLES } from '../src/examples/index';

// The node union tries the one member a value can be before it walks its
// members (schemas/node.schema.ts). A parse that may wait never takes that
// first try, so `safeParseAsync` is the union walked as zod walks it — and the
// two must say the same of every config: accepted with the same data, or
// refused with the same issues at the same paths.

const WRONG: unknown[] = [5, { $bogus: 1 }];

type Parent = Record<string, unknown> | unknown[];
const withAt = (node: Parent, key: string, value: unknown): Parent =>
  Array.isArray(node) ? node.map((item, i) => (String(i) === key ? value : item)) : { ...node, [key]: value };

// Every config one change away from `node`: a part put wrong, a key taken out
// or added — at every depth.
const damaged = function* (node: unknown): Generator<unknown> {
  if (node === null || typeof node !== 'object') return;
  const parent = node as Parent;
  for (const [key, value] of Object.entries(parent)) {
    for (const wrong of WRONG) yield withAt(parent, key, wrong);
    for (const inner of damaged(value)) yield withAt(parent, key, inner);
    if (Array.isArray(parent)) continue;
    const { [key]: _taken, ...rest } = parent;
    yield rest;
  }
  if (!Array.isArray(parent)) {
    yield { ...parent, extra: 1 };
    yield { ...parent, $ref: '$.a' };
  }
};

const said = (result: { success: boolean; data?: unknown; error?: { issues: unknown } }): string =>
  JSON.stringify([result.success, result.data, result.error?.issues]);

// Small on purpose: a refusal is the union walked, at over a millisecond each,
// and both sides of each comparison pay it.
const SMALL: unknown[] = [
  { name: { $ref: '$.member.name' }, seats: { $join: { parts: { $ref: '$.seats' }, sep: ', ' } } },
  { $map: { over: { $ref: '$.rows' }, as: 'row', body: { id: { $get: { from: { $var: 'row' }, path: ['id'] } } } } },
  [{ $case: { branches: [{ when: { $gt: [{ $ref: '$.n' }, 1] }, then: 'many' }], else: 'one' } }, { __optional: ['a'], a: { $ref: '$.a' } }],
];

describe('the node union, tried by key and walked', () => {
  it('say the same of every example', async () => {
    for (const example of PRISM_EXAMPLES) {
      const tried = ConfigSchema.safeParse(example.config);
      expect(tried.success, example.id).toBe(true);
      expect(said(tried), example.id).toBe(said(await ConfigSchema.safeParseAsync(example.config)));
    }
  });

  it('say the same of every config one change away from a small one', async () => {
    let valid = 0;
    let refused = 0;
    for (const config of SMALL.flatMap((small) => [...damaged(small)])) {
      const tried = ConfigSchema.safeParse(config);
      expect(said(tried), JSON.stringify(config)).toBe(said(await ConfigSchema.safeParseAsync(config)));
      if (tried.success) valid += 1;
      else refused += 1;
    }
    // Worth something only while it holds both kinds.
    expect(valid).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(50);
  });

  it('a refusal still names the part that is wrong', () => {
    expect(validate({ a: { $get: { pathh: 1 } } })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ path: ['a', '$get'] })]) });
    expect(validate({ a: [{ $bogus: 1 }] })).toEqual({
      ok: false,
      issues: [{ path: ['a', 0, '$bogus'], message: 'Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.' }],
    });
  });

  it('a value that is not plain JSON is refused as it was', async () => {
    for (const value of [undefined, () => 1, new Date(0), Object.create({ $ref: '$' }), Number.NaN, { a: undefined }, [undefined]]) {
      expect(said(ConfigSchema.safeParse(value))).toBe(said(await ConfigSchema.safeParseAsync(value)));
    }
  });
});
