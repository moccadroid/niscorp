import { describe, expect, it } from 'vitest';
import { compile, evaluate, evaluateSafe, execute, ErrorCode, type JsonValue } from '../src';

const items = (n: number): { items: number[] } => ({ items: Array.from({ length: n }, (_, i) => i) });
const doubleString = { $reduce: { over: { $ref: '$.items' }, as: 'x', init: 'ab', body: { $join: { parts: [{ $var: 'acc' }, { $var: 'acc' }] } } } };
const doubleArray = { $reduce: { over: { $ref: '$.items' }, as: 'x', init: [1], body: [{ $var: 'acc' }, { $var: 'acc' }] } };
const cubed = { $map: { over: { $ref: '$.items' }, as: 'a', body: { $map: { over: { $ref: '$.items' }, as: 'b', body: { $map: { over: { $ref: '$.items' }, as: 'c', body: 1 } } } } } };

describe('the evaluation budget', () => {
  it('stops a string that doubles itself', () => {
    expect(() => evaluate(doubleString, items(40))).toThrow(/a string of \d+ characters/);
  });

  it('stops an array that doubles itself by sharing its halves', async () => {
    const ir = await compile(doubleArray);
    expect(() => execute(ir, items(40))).toThrow(/too many values/);
  });

  it('stops a $with nested to double a binding', () => {
    let config: unknown = { $var: 'x' };
    for (let i = 0; i < 30; i++) config = { $with: { let: { x: [{ $var: 'x' }, { $var: 'x' }] }, value: config } };
    expect(() => evaluate({ $with: { let: { x: [1] }, value: config } } as Parameters<typeof evaluate>[0], {})).toThrow(/too many values/);
  });

  it('stops a $fill whose slots double the text at each level before it builds the whole text', () => {
    let phrase: unknown = 'x';
    for (let i = 0; i < 25; i++) phrase = { phrase: '{a}{a}', slots: { a: phrase } };
    expect(() => evaluate({ $fill: { $ref: '$.p' } }, { p: phrase }, { limits: { maxStringLength: 1000 } })).toThrow(/a string of \d{4} characters \(limit 1000\)/);
    expect(evaluate({ $fill: { $ref: '$.p' } }, { p: { phrase: '{n} items', slots: { n: 3 } } })).toBe('3 items');
  });

  it('stops nested maps that evaluate too many nodes', () => {
    expect(() => evaluate(cubed, items(200))).toThrow(/too many nodes/);
  });

  it('takes limits', () => {
    expect(() => evaluate(doubleString, items(4), { limits: { maxStringLength: 16 } })).toThrow(/limit 16/);
    expect(evaluate(doubleString, items(3), { limits: { maxStringLength: 16 } })).toBe('ab'.repeat(8));
  });

  it('leaves an ordinary mapping alone — 1000 rows', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `n${i}` }));
    const ir = await compile({ $map: { over: { $ref: '$.rows' }, as: 'r', body: { row_id: { $get: { from: { $var: 'r' }, path: ['id'] } } } } });
    expect(execute(ir, { rows })).toHaveLength(1000);
  });
});

describe('a source nested deeper than the stack reaches', () => {
  let deep: JsonValue = [];
  for (let i = 0; i < 100_000; i++) deep = [deep];
  const source = { deep };

  it.each([
    ['$ref', { $ref: '$.deep' }],
    ['$unique', { $unique: { $ref: '$.deep' } }],
  ])('is stopped by the budget in %s', async (_op, config) => {
    const result = evaluateSafe(config, source);
    expect(result.ok ? undefined : result.error).toMatchObject({ code: ErrorCode.BUDGET });
    const ir = await compile(config);
    expect(() => execute(ir, source)).toThrow(expect.objectContaining({ code: ErrorCode.BUDGET }));
  });

  // Whether JSON.stringify runs out of stack at this depth depends on the engine and platform.
  it('gives $toString a string or the budget error, never a raw RangeError', async () => {
    const config = { $toString: { $ref: '$.deep' } };
    const result = evaluateSafe(config, source);
    if (!result.ok) expect(result.error).toMatchObject({ code: ErrorCode.BUDGET });
    else expect(result.value).toBeTypeOf('string');
    const ir = await compile(config);
    try {
      expect(execute(ir, source)).toBeTypeOf('string');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.BUDGET });
    }
  });

  it('is stopped by the budget when the source is checked', () => {
    const result = evaluateSafe({ $ref: '$.deep' }, source, { check: 'always' });
    expect(result.ok ? undefined : result.error).toMatchObject({ code: ErrorCode.BUDGET });
  });
});

describe('a source that refers back to itself', () => {
  const cyclic = (): { b: number; self?: unknown } => {
    const source: { b: number; self?: unknown } = { b: 1 };
    source.self = source;
    return source;
  };

  it('is refused as not JSON when the source is checked, naming where it refers back', () => {
    const result = evaluateSafe({ $ref: '$.b' }, cyclic(), { check: 'always' });
    expect(result.ok ? undefined : result.error).toMatchObject({ code: ErrorCode.TYPE, message: 'The source must be plain JSON: source.self refers back to source.' });
  });

  it('is stopped by the budget with a message that names the loop when it is walked unchecked', () => {
    const result = evaluateSafe({ $walk: { over: { $ref: '$' }, as: 'n', rules: [{ when: false, then: null }] } }, cyclic());
    expect(result.ok ? undefined : result.error).toMatchObject({ code: ErrorCode.BUDGET, message: expect.stringContaining('refers back to itself') });
  });

  it('a value reached twice without a loop is plain JSON', () => {
    const shared = { n: 1 };
    expect(evaluate({ $ref: '$.a' }, { a: shared, b: shared }, { check: 'always' })).toEqual({ n: 1 });
  });
});
