import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = {};

describe('$not', () => {
  it('negates truthy', () => expect(evaluate({ $not: { $const: true } }, source)).toBe(false));
  it('negates falsy', () => expect(evaluate({ $not: { $const: false } }, source)).toBe(true));
  it('negates null', () => expect(evaluate({ $not: { $const: null } }, source)).toBe(true));
  it('negates non-zero number', () => expect(evaluate({ $not: { $const: 1 } }, source)).toBe(false));
});

describe('$and', () => {
  it('all truthy', () => expect(evaluate({ $and: [{ $const: 1 }, { $const: 'yes' }, { $const: true }] }, source)).toBe(true));
  it('short-circuits on falsy', () => expect(evaluate({ $and: [{ $const: true }, { $const: 0 }, { $const: 'never' }] }, source)).toBe(0));
  it('returns last truthy', () => expect(evaluate({ $and: [{ $const: 1 }, { $const: 2 }] }, source)).toBe(2));
});

describe('$or', () => {
  it('returns first truthy', () => expect(evaluate({ $or: [{ $const: false }, { $const: 0 }, { $const: 'yes' }] }, source)).toBe('yes'));
  it('all falsy returns last', () => expect(evaluate({ $or: [{ $const: false }, { $const: 0 }, { $const: null }] }, source)).toBe(null));
  it('short-circuits', () => expect(evaluate({ $or: [{ $const: 'first' }, { $const: 'second' }] }, source)).toBe('first'));
});
