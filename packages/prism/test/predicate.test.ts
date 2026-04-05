import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = { a: 5, b: 10, text: 'Hello World', empty: '', arr: [], obj: {} };

describe('$eq / $neq', () => {
  it('equal numbers', () => expect(evaluate({ $eq: [{ $const: 5 }, { $const: 5 }] }, source)).toBe(true));
  it('unequal numbers', () => expect(evaluate({ $eq: [{ $const: 5 }, { $const: 6 }] }, source)).toBe(false));
  it('deep equal objects', () => expect(evaluate({ $eq: [{ $const: { a: 1 } }, { $const: { a: 1 } }] }, source)).toBe(true));
  it('neq', () => expect(evaluate({ $neq: [{ $const: 1 }, { $const: 2 }] }, source)).toBe(true));
});

describe('$gt / $gte / $lt / $lte', () => {
  it('gt true', () => expect(evaluate({ $gt: [{ $ref: '$.b' }, { $ref: '$.a' }] }, source)).toBe(true));
  it('gt false', () => expect(evaluate({ $gt: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(false));
  it('gte equal', () => expect(evaluate({ $gte: [{ $const: 5 }, { $const: 5 }] }, source)).toBe(true));
  it('lt', () => expect(evaluate({ $lt: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(true));
  it('lte', () => expect(evaluate({ $lte: [{ $const: 5 }, { $const: 5 }] }, source)).toBe(true));
  it('compares strings', () => expect(evaluate({ $gt: [{ $const: 'b' }, { $const: 'a' }] }, source)).toBe(true));
});

describe('$empty', () => {
  it('null is empty', () => expect(evaluate({ $empty: { $const: null } }, source)).toBe(true));
  it('empty string', () => expect(evaluate({ $empty: { $ref: '$.empty' } }, source)).toBe(true));
  it('empty array', () => expect(evaluate({ $empty: { $ref: '$.arr' } }, source)).toBe(true));
  it('empty object', () => expect(evaluate({ $empty: { $ref: '$.obj' } }, source)).toBe(true));
  it('non-empty string', () => expect(evaluate({ $empty: { $ref: '$.text' } }, source)).toBe(false));
  it('number is not empty', () => expect(evaluate({ $empty: { $const: 0 } }, source)).toBe(false));
});

describe('$startsWith / $endsWith / $contains', () => {
  it('startsWith true', () => expect(evaluate({ $startsWith: { value: { $ref: '$.text' }, prefix: { $const: 'Hello' } } }, source)).toBe(true));
  it('startsWith false', () => expect(evaluate({ $startsWith: { value: { $ref: '$.text' }, prefix: { $const: 'World' } } }, source)).toBe(false));
  it('endsWith', () => expect(evaluate({ $endsWith: { value: { $ref: '$.text' }, suffix: { $const: 'World' } } }, source)).toBe(true));
  it('contains', () => expect(evaluate({ $contains: { value: { $ref: '$.text' }, search: { $const: 'lo Wo' } } }, source)).toBe(true));
});
