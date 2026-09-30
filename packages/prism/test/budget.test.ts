import { describe, expect, it } from 'vitest';
import { compile, evaluate, execute } from '../src';

// A small config that makes something enormous is stopped, each by the limit
// that sees its shape — and an ordinary mapping is not.
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

  it('stops nested maps that evaluate too many nodes', () => {
    expect(() => evaluate(cubed, items(200))).toThrow(/too many nodes/);
  });

  it('takes limits', () => {
    expect(() => evaluate(doubleString, items(4), { maxStringLength: 16 })).toThrow(/limit 16/);
    expect(evaluate(doubleString, items(3), { maxStringLength: 16 })).toBe('ab'.repeat(8));
  });

  it('leaves an ordinary mapping alone — 1000 rows', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `n${i}` }));
    const ir = await compile({ $map: { over: { $ref: '$.rows' }, as: 'r', body: { row_id: { $get: { from: { $var: 'r' }, path: ['id'] } } } } });
    expect(execute(ir, { rows })).toHaveLength(1000);
  });
});
