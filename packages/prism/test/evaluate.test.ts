import { describe, it, expect } from 'vitest';
import { evaluate, evaluateSafe, PrismError } from '../src/index';
import { PRISM_EXAMPLES } from '../src/examples/index';

// evaluate checks a config object the first time it sees it and keeps its
// tree; the second time it optimizes the tree; from the third it only runs.
// What a call answers, and refuses, is the same on each.
describe('evaluate — the same config object again', () => {
  it('answers every example the same on the first, second and third call', () => {
    for (const example of PRISM_EXAMPLES) {
      for (const call of [1, 2, 3]) expect(evaluate(example.config, example.source), `${example.id}, call ${call}`).toEqual(example.expected);
    }
  });

  it('answers for the source of each call', () => {
    const config = { name: { $upper: { $ref: '$.name' } } };
    expect(evaluate(config, { name: 'ada' })).toEqual({ name: 'ADA' });
    expect(evaluate(config, { name: 'grace' })).toEqual({ name: 'GRACE' });
    expect(evaluate(config, { name: 'alan' })).toEqual({ name: 'ALAN' });
  });

  it('a caller that changes an answer does not change the next one', () => {
    const config = { tags: { $const: ['a'] }, folded: { $merge: [{ $const: { n: 1 } }, { $const: { m: 2 } }] } };
    for (const call of [1, 2, 3, 4]) {
      const answer = evaluate(config, {}) as { tags: string[]; folded: Record<string, number> };
      expect(answer, `call ${call}`).toEqual({ tags: ['a'], folded: { n: 1, m: 2 } });
      answer.tags.push('b');
      answer.folded['n'] = 9;
    }
  });

  it('spends a budget of its own on each call', () => {
    const rows = Array.from({ length: 110 }, (_, i) => i);
    const cube = { $map: { over: { $ref: '$' }, as: 'a', body: { $map: { over: { $ref: '$' }, as: 'b', body: { $map: { over: { $ref: '$' }, as: 'c', body: 1 } } } } } };
    for (const call of [1, 2, 3]) expect(() => evaluate(cube, rows), `call ${call}`).toThrow(expect.objectContaining({ code: 'E_BUDGET' }));
    expect(evaluate(cube, [1])).toEqual([[[1]]]);
  });

  it('takes limits on any call', () => {
    const config = { $map: { over: { $ref: '$' }, as: 'n', body: { $var: 'n' } } };
    expect(evaluate(config, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(() => evaluate(config, [1, 2, 3], { limits: { maxSteps: 3 } })).toThrow(expect.objectContaining({ code: 'E_BUDGET' }));
    expect(evaluate(config, [1, 2, 3], { limits: { maxSteps: 100 } })).toEqual([1, 2, 3]);
  });

  it('refuses an invalid config on every call, with the part that is wrong', () => {
    const config = { at: { $get: { pathh: 1 } } };
    for (const call of [1, 2, 3]) {
      expect(() => evaluate(config, {}), `call ${call}`).toThrow(expect.objectContaining({ code: 'E_SCHEMA' }));
    }
    expect(() => evaluate(config, {})).toThrow(PrismError);
  });

  it('refuses a config nested past the depth limit, however deep', () => {
    for (const depth of [300, 20000]) {
      let config: unknown = 1;
      for (let i = 0; i < depth; i++) config = { a: config };
      expect(() => evaluate(config, {}), `depth ${depth}`).toThrow(PrismError);
      expect(() => evaluate(config, {}), `depth ${depth}`).toThrow(PrismError);
    }
  });

  it('a config that is not an object is checked each time, and answers itself', () => {
    expect(evaluate(5, {})).toBe(5);
    expect(evaluate('text', {})).toBe('text');
    expect(evaluate(null, {})).toBe(null);
  });

  // The other side of keeping by the object.
  it('does not read a config again that was changed in place; a new object is read', () => {
    const config: Record<string, unknown> = { out: { $ref: '$.a' } };
    expect(evaluate(config, { a: 1, b: 2 })).toEqual({ out: 1 });
    config['out'] = { $ref: '$.b' };
    expect(evaluate(config, { a: 1, b: 2 })).toEqual({ out: 1 });
    expect(evaluate({ ...config }, { a: 1, b: 2 })).toEqual({ out: 2 });
  });

  it('answers a source that is not plain JSON as well as it can: nothing is checked', () => {
    expect(evaluate({ name: { $ref: '$.name' } }, { name: 'ada', note: undefined, at: () => 1 })).toEqual({ name: 'ada' });
  });

  it('is the function a host seam takes', () => {
    const seam: (config: unknown, source: unknown) => unknown = evaluate;
    expect(seam({ $length: { $ref: '$' } }, ['a', 'b'])).toBe(2);
  });
});

// For writing a config, for tests and for tools: everything is checked, on
// every call, and nothing is kept.
describe("evaluate — check: 'always'", () => {
  const always = { check: 'always' } as const;

  it('answers as a call without it does', () => {
    for (const example of PRISM_EXAMPLES) expect(evaluate(example.config, example.source, always), example.id).toEqual(example.expected);
  });

  it('reads a config again that was changed in place, also after it was kept', () => {
    const config: Record<string, unknown> = { out: { $ref: '$.a' } };
    expect(evaluate(config, { a: 1, b: 2 })).toEqual({ out: 1 });
    config['out'] = { $ref: '$.b' };
    expect(evaluate(config, { a: 1, b: 2 }, always)).toEqual({ out: 2 });
    config['out'] = { $bogus: 1 };
    expect(() => evaluate(config, { a: 1, b: 2 }, always)).toThrow(expect.objectContaining({ code: 'E_SCHEMA' }));
  });

  it('refuses a source that is not plain JSON, and says so', () => {
    for (const source of [{ note: undefined }, { at: () => 1 }, { n: Number.NaN }, [new Date(0)], undefined]) {
      expect(() => evaluate({ $ref: '$' }, source, always)).toThrow(expect.objectContaining({ code: 'E_TYPE', message: 'The source must be plain JSON.' }));
    }
    expect(evaluate({ $length: { $ref: '$' } }, ['a', 'b'], always)).toBe(2);
  });

  it('hands out an answer the caller may change', () => {
    const config = { tags: { $const: ['a'] } };
    (evaluate(config, {}, always) as { tags: string[] }).tags.push('b');
    expect(evaluate(config, {}, always)).toEqual({ tags: ['a'] });
  });

  it('takes limits beside it', () => {
    expect(() => evaluate({ $map: { over: { $ref: '$' }, as: 'n', body: 1 } }, [1, 2, 3], { check: 'always', limits: { maxSteps: 3 } })).toThrow(expect.objectContaining({ code: 'E_BUDGET' }));
  });
});

describe('evaluateSafe', () => {
  it('answers with the data, or with the error, and takes the same options', () => {
    expect(evaluateSafe({ $ref: '$.a' }, { a: 1 })).toEqual({ ok: true, data: 1 });
    const refused = evaluateSafe({ $bogus: 1 }, {});
    expect(refused.ok).toBe(false);
    const notJson = evaluateSafe({ $ref: '$' }, { at: () => 1 }, { check: 'always' });
    expect(notJson).toMatchObject({ ok: false, error: { code: 'E_TYPE' } });
  });
});
