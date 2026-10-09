import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = { greeting: 'Hello', name: 'World', user: { name: 'Alice', age: 30 } };

describe('$join', () => {
  it('joins with separator', () => {
    expect(evaluate({ $join: { parts: [{ $ref: '$.greeting' }, { $ref: '$.name' }], sep: ' ' } }, source)).toBe('Hello World');
  });
  it('joins without separator', () => {
    expect(evaluate({ $join: { parts: [{ $const: 'a' }, { $const: 'b' }] } }, source)).toBe('ab');
  });
});

describe('$toString', () => {
  it('stringifies number', () => expect(evaluate({ $toString: { $const: 42 } }, source)).toBe('42'));
  it('stringifies null', () => expect(evaluate({ $toString: { $const: null } }, source)).toBe('null'));
  it('stringifies object', () => expect(evaluate({ $toString: { $const: { a: 1 } } }, source)).toBe('{"a":1}'));
});

describe('$interpolate', () => {
  it('replaces placeholders', () => {
    const config = { $interpolate: { template: 'Hi {{name}}, age {{age}}', values: { $ref: '$.user' } } };
    expect(evaluate(config, source)).toBe('Hi Alice, age 30');
  });
  it('handles missing keys', () => {
    const config = { $interpolate: { template: 'Hi {{unknown}}', values: { $ref: '$.user' } } };
    expect(evaluate(config, source)).toBe('Hi ');
  });
});

describe('$trim', () => {
  it('trims whitespace', () => expect(evaluate({ $trim: { $const: '  hello  ' } }, source)).toBe('hello'));
});

describe('$lower', () => {
  it('lowercases', () => expect(evaluate({ $lower: { $ref: '$.greeting' } }, source)).toBe('hello'));
});

describe('$upper', () => {
  it('uppercases', () => expect(evaluate({ $upper: { $ref: '$.greeting' } }, source)).toBe('HELLO'));
});

describe('$split', () => {
  it('splits string', () => expect(evaluate({ $split: { value: { $const: 'a,b,c' }, sep: ',' } }, source)).toEqual(['a', 'b', 'c']));
});

describe('$replace — all', () => {
  const replace = (value: string, search: string, replacement: string, all?: boolean): unknown =>
    evaluate({ $replace: { value: { $const: value }, search, replacement, ...(all === undefined ? {} : { all }) } }, source);

  it('replaces only the first occurrence unless told', () => {
    expect(replace('a-b-c', '-', '+')).toBe('a+b-c');
    expect(replace('a-b-c', '-', '+', false)).toBe('a+b-c');
  });
  it('replaces every occurrence with all: true', () => {
    expect(replace('a-b-c', '-', '+', true)).toBe('a+b+c');
    expect(replace('+43 660 123 45', ' ', '', true)).toBe('+4366012345');
    expect(replace('abc', 'x', 'y', true)).toBe('abc');
  });
  it('reads search as text, not as a pattern', () => {
    expect(replace('a.b.c', '.', '-', true)).toBe('a-b-c');
    expect(replace('1+1', '+', ' plus ', true)).toBe('1 plus 1');
  });
});

describe('$replace', () => {
  it('replaces first occurrence', () => {
    expect(evaluate({ $replace: { value: { $const: 'hello world' }, search: 'world', replacement: 'there' } }, source)).toBe('hello there');
  });
});
