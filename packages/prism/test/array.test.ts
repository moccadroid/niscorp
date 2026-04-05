import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = {
  numbers: [3, 1, 4, 1, 5, 9, 2, 6],
  items: [
    { name: 'Apple', price: 1.5, category: 'fruit' },
    { name: 'Banana', price: 0.5, category: 'fruit' },
    { name: 'Carrot', price: 2.0, category: 'vegetable' },
    { name: 'Date', price: 3.0, category: 'fruit' },
  ],
  nested: [[1, 2], [3, 4], [5]],
  text: 'hello world',
};

describe('$map', () => {
  it('transforms each element', () => {
    const config = {
      $map: { over: { $ref: '$.numbers' }, as: 'n', body: { $mul: [{ $var: 'n' }, { $const: 2 }] } },
    };
    expect(evaluate(config, source)).toEqual([6, 2, 8, 2, 10, 18, 4, 12]);
  });

  it('maps objects', () => {
    const config = {
      $map: { over: { $ref: '$.items' }, as: 'item', body: { $get: { from: { $var: 'item' }, path: ['name'] } } },
    };
    expect(evaluate(config, source)).toEqual(['Apple', 'Banana', 'Carrot', 'Date']);
  });
});

describe('$filter', () => {
  it('filters by condition', () => {
    const config = {
      $filter: {
        over: { $ref: '$.numbers' },
        as: 'n',
        when: { $gt: [{ $var: 'n' }, { $const: 4 }] },
      },
    };
    expect(evaluate(config, source)).toEqual([5, 9, 6]);
  });

  it('filters objects', () => {
    const config = {
      $filter: {
        over: { $ref: '$.items' },
        as: 'item',
        when: { $eq: [{ $get: { from: { $var: 'item' }, path: ['category'] } }, { $const: 'fruit' }] },
      },
    };
    const result = evaluate(config, source) as any[];
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Apple');
  });
});

describe('$reduce', () => {
  it('sums numbers', () => {
    const config = {
      $reduce: {
        over: { $ref: '$.numbers' },
        as: 'n',
        acc: 'total',
        init: { $const: 0 },
        body: { $add: [{ $var: 'total' }, { $var: 'n' }] },
      },
    };
    expect(evaluate(config, source)).toBe(31);
  });

  it('uses default acc name', () => {
    const config = {
      $reduce: {
        over: { $const: [1, 2, 3] },
        as: 'n',
        init: { $const: 0 },
        body: { $add: [{ $var: 'acc' }, { $var: 'n' }] },
      },
    };
    expect(evaluate(config, source)).toBe(6);
  });
});

describe('$slice', () => {
  it('slices array', () => {
    expect(evaluate({ $slice: { from: { $ref: '$.numbers' }, start: 0, end: 3 } }, source)).toEqual([3, 1, 4]);
  });
  it('slices with start only', () => {
    expect(evaluate({ $slice: { from: { $ref: '$.numbers' }, start: 6 } }, source)).toEqual([2, 6]);
  });
  it('slices strings', () => {
    expect(evaluate({ $slice: { from: { $ref: '$.text' }, start: 0, end: 5 } }, source)).toBe('hello');
  });
});

describe('$flatten', () => {
  it('flattens one level', () => {
    expect(evaluate({ $flatten: { $ref: '$.nested' } }, source)).toEqual([1, 2, 3, 4, 5]);
  });
  it('handles non-array items', () => {
    expect(evaluate({ $flatten: { $const: [[1], 2, [3, 4]] } }, source)).toEqual([1, 2, 3, 4]);
  });
});

describe('$unique', () => {
  it('deduplicates', () => {
    expect(evaluate({ $unique: { $ref: '$.numbers' } }, source)).toEqual([3, 1, 4, 5, 9, 2, 6]);
  });
});

describe('$sortBy', () => {
  it('sorts ascending', () => {
    const config = {
      $sortBy: { over: { $ref: '$.items' }, as: 'item', by: { $get: { from: { $var: 'item' }, path: ['price'] } } },
    };
    const result = evaluate(config, source) as any[];
    expect(result[0].name).toBe('Banana');
    expect(result[3].name).toBe('Date');
  });
  it('sorts descending', () => {
    const config = {
      $sortBy: { over: { $ref: '$.items' }, as: 'item', by: { $get: { from: { $var: 'item' }, path: ['price'] } }, dir: 'desc' },
    };
    const result = evaluate(config, source) as any[];
    expect(result[0].name).toBe('Date');
  });
});
