import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = { obj: { a: 1, b: 2, c: 3 }, arr: ['x', 'y', 'z'], text: 'hello' };

describe('$keys', () => {
  it('returns object keys', () => expect(evaluate({ $keys: { $ref: '$.obj' } }, source)).toEqual(['a', 'b', 'c']));
});

describe('$values', () => {
  it('returns object values', () => expect(evaluate({ $values: { $ref: '$.obj' } }, source)).toEqual([1, 2, 3]));
});

describe('$fromEntries', () => {
  it('builds object from entries', () => {
    expect(evaluate({ $fromEntries: { $const: [['x', 1], ['y', 2]] } }, source)).toEqual({ x: 1, y: 2 });
  });
});

describe('$pick', () => {
  it('picks keys', () => {
    expect(evaluate({ $pick: { from: { $ref: '$.obj' }, keys: ['a', 'c'] } }, source)).toEqual({ a: 1, c: 3 });
  });
  it('ignores missing keys', () => {
    expect(evaluate({ $pick: { from: { $ref: '$.obj' }, keys: ['a', 'z'] } }, source)).toEqual({ a: 1 });
  });
});

describe('$omit', () => {
  it('omits keys', () => {
    expect(evaluate({ $omit: { from: { $ref: '$.obj' }, keys: ['b'] } }, source)).toEqual({ a: 1, c: 3 });
  });
});

describe('$type', () => {
  it('string', () => expect(evaluate({ $type: { $const: 'hi' } }, source)).toBe('string'));
  it('number', () => expect(evaluate({ $type: { $const: 42 } }, source)).toBe('number'));
  it('boolean', () => expect(evaluate({ $type: { $const: true } }, source)).toBe('boolean'));
  it('null', () => expect(evaluate({ $type: { $const: null } }, source)).toBe('null'));
  it('array', () => expect(evaluate({ $type: { $ref: '$.arr' } }, source)).toBe('array'));
  it('object', () => expect(evaluate({ $type: { $ref: '$.obj' } }, source)).toBe('object'));
});

describe('$length', () => {
  it('array length', () => expect(evaluate({ $length: { $ref: '$.arr' } }, source)).toBe(3));
  it('string length', () => expect(evaluate({ $length: { $ref: '$.text' } }, source)).toBe(5));
});
