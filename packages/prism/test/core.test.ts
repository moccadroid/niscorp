import { describe, it, expect } from 'vitest';
import { evaluate, PrismError } from '../src';

const source = {
  user: { id: 'u1', name: 'Alice', email: 'alice@example.com', age: 30 },
  items: [
    { sku: 'A1', price: 10 },
    { sku: 'A2', price: 20 },
    { sku: 'A3', price: 30 },
  ],
  nested: { deep: { value: 42 } },
  tags: ['a', 'b', 'c'],
};

describe('$const', () => {
  it('returns a number', () => expect(evaluate({ $const: 42 }, source)).toBe(42));
  it('returns a string', () => expect(evaluate({ $const: 'hello' }, source)).toBe('hello'));
  it('returns null', () => expect(evaluate({ $const: null }, source)).toBe(null));
  it('returns a boolean', () => expect(evaluate({ $const: true }, source)).toBe(true));
  it('returns an object', () => expect(evaluate({ $const: { a: 1 } }, source)).toEqual({ a: 1 }));
  it('returns an array', () => expect(evaluate({ $const: [1, 2] }, source)).toEqual([1, 2]));
});

describe('$ref', () => {
  it('resolves a simple path', () => expect(evaluate({ $ref: '$.user.name' }, source)).toBe('Alice'));
  it('resolves a nested path', () => expect(evaluate({ $ref: '$.nested.deep.value' }, source)).toBe(42));
  it('resolves an array item', () => expect(evaluate({ $ref: '$.tags' }, source)).toEqual(['a', 'b', 'c']));
  it('resolves array index', () => expect(evaluate({ $ref: '$.items[0].sku' }, source)).toBe('A1'));
  it('throws on missing path', () => {
    expect(() => evaluate({ $ref: '$.nonexistent' }, source)).toThrow(PrismError);
  });
});

describe('$var + $with', () => {
  it('binds and reads a variable', () => {
    const config = {
      $with: {
        let: { u: { $ref: '$.user' } },
        value: { $get: { from: { $var: 'u' }, path: ['name'] } },
      },
    };
    expect(evaluate(config, source)).toBe('Alice');
  });

  it('supports multiple bindings', () => {
    const config = {
      $with: {
        let: { a: { $const: 10 }, b: { $const: 20 } },
        value: { $add: [{ $var: 'a' }, { $var: 'b' }] },
      },
    };
    expect(evaluate(config, source)).toBe(30);
  });

  it('throws on undefined variable', () => {
    expect(() => evaluate({ $var: 'nope' }, source)).toThrow(PrismError);
  });
});

describe('$get', () => {
  it('navigates object paths', () => {
    const config = { $get: { from: { $ref: '$.user' }, path: ['email'] } };
    expect(evaluate(config, source)).toBe('alice@example.com');
  });

  it('navigates array indices', () => {
    const config = { $get: { from: { $ref: '$.items' }, path: [1, 'price'] } };
    expect(evaluate(config, source)).toBe(20);
  });

  it('returns fallback on missing path', () => {
    const config = { $get: { from: { $ref: '$.user' }, path: ['nonexistent'], fallback: { $const: 'default' } } };
    expect(evaluate(config, source)).toBe('default');
  });

  it('supports dynamic path segments', () => {
    const config = {
      $get: {
        from: { $ref: '$.items' },
        path: [{ $const: 0 }, 'sku'],
      },
    };
    expect(evaluate(config, source)).toBe('A1');
  });

  it('throws without fallback on missing path', () => {
    const config = { $get: { from: { $ref: '$.user' }, path: ['nonexistent'] } };
    expect(() => evaluate(config, source)).toThrow(PrismError);
  });
});

describe('plain objects', () => {
  it('evaluates template objects recursively', () => {
    const config = { name: { $ref: '$.user.name' }, active: true };
    expect(evaluate(config, source)).toEqual({ name: 'Alice', active: true });
  });

  it('handles __optional — omits null fields', () => {
    const config = {
      name: { $ref: '$.user.name' },
      missing: { $ref: '$.user.nickname' },
      __optional: ['missing'],
    };
    expect(evaluate(config, source)).toEqual({ name: 'Alice' });
  });

  it('handles nested template objects', () => {
    const config = {
      profile: {
        name: { $ref: '$.user.name' },
        id: { $ref: '$.user.id' },
      },
    };
    expect(evaluate(config, source)).toEqual({ profile: { name: 'Alice', id: 'u1' } });
  });
});

describe('arrays as config', () => {
  it('evaluates array of nodes', () => {
    const config = [{ $const: 1 }, { $const: 2 }, { $ref: '$.user.name' }];
    expect(evaluate(config, source)).toEqual([1, 2, 'Alice']);
  });
});

describe('primitives as config', () => {
  it('returns string as-is', () => expect(evaluate('hello' as any, source)).toBe('hello'));
  it('returns number as-is', () => expect(evaluate(42 as any, source)).toBe(42));
  it('returns null as-is', () => expect(evaluate(null as any, source)).toBe(null));
  it('returns boolean as-is', () => expect(evaluate(true as any, source)).toBe(true));
});
