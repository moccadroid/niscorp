import { describe, it, expect } from 'vitest';
import { evaluate, PrismError } from '../src';

const source = { a: 10, b: 3 };

describe('$add', () => {
  it('adds two numbers', () => expect(evaluate({ $add: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(13));
  it('adds with const', () => expect(evaluate({ $add: [{ $const: 5 }, { $const: 7 }] }, source)).toBe(12));
});

describe('$sub', () => {
  it('subtracts', () => expect(evaluate({ $sub: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(7));
});

describe('$mul', () => {
  it('multiplies', () => expect(evaluate({ $mul: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(30));
});

describe('$div', () => {
  it('divides', () => expect(evaluate({ $div: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBeCloseTo(3.333));
  it('throws on division by zero', () => {
    expect(() => evaluate({ $div: [{ $const: 1 }, { $const: 0 }] }, source)).toThrow(PrismError);
  });
});

describe('$round', () => {
  it('rounds to 0 digits', () => expect(evaluate({ $round: { value: { $const: 3.7 } } }, source)).toBe(4));
  it('rounds to 2 digits', () => expect(evaluate({ $round: { value: { $const: 3.14159 }, digits: 2 } }, source)).toBe(3.14));
});

describe('type errors', () => {
  it('$add throws on non-numbers', () => {
    expect(() => evaluate({ $add: [{ $const: 'a' }, { $const: 1 }] }, source)).toThrow();
  });
});
