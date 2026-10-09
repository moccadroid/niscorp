import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = { a: 5, b: 10, text: 'Hello World', empty: '', arr: [], obj: {} };

describe('$eq / $neq', () => {
  it('equal numbers', () => expect(evaluate({ $eq: [{ $const: 5 }, { $const: 5 }] }, source)).toBe(true));
  it('unequal numbers', () => expect(evaluate({ $eq: [{ $const: 5 }, { $const: 6 }] }, source)).toBe(false));
  it('deep equal objects', () => expect(evaluate({ $eq: [{ $const: { a: 1 } }, { $const: { a: 1 } }] }, source)).toBe(true));
  it('neq', () => expect(evaluate({ $neq: [{ $const: 1 }, { $const: 2 }] }, source)).toBe(true));

  // Equal is "the same JSON". Every pair here is answered as two JSON texts
  // compared would answer it.
  const pairs: [string, unknown, unknown][] = [
    ['two equal strings', 'paid', 'paid'], ['two strings', 'paid', 'pending'], ['a number and its text', 1, '1'],
    ['zero and minus zero', 0, -0], ['true and 1', true, 1], ['null and null', null, null], ['null and false', null, false],
    ['null and an empty object', null, {}], ['an empty string and null', '', null], ['a string and an array of it', 'a', ['a']],
    ['two equal arrays', [1, [2, 'x']], [1, [2, 'x']]], ['arrays in another order', [1, 2], [2, 1]],
    ['an array and an object', [], {}], ['objects with the keys in another order', { a: 1, b: 2 }, { b: 2, a: 1 }],
    ['objects nested alike', { a: { b: [null] } }, { a: { b: [null] } }],
  ];
  for (const [name, a, b] of pairs) {
    it(`${name}: as their JSON texts compare`, () => {
      const same = JSON.stringify(a) === JSON.stringify(b);
      expect(evaluate({ $eq: [{ $const: a }, { $const: b }] }, source)).toBe(same);
      expect(evaluate({ $neq: [{ $const: b }, { $const: a }] }, source)).toBe(!same);
    });
  }
  it('a value read twice from the source is equal to itself', () => {
    expect(evaluate({ $eq: [{ $ref: '$' }, { $ref: '$' }] }, source)).toBe(true);
  });
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
