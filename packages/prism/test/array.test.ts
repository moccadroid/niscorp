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
  // A list has no order for compare(), so a sort by `[a, b]` handed the items
  // back as they came. It says so, and says what to write.
  it('refuses a key that is a list or an object, and says how to sort by two keys', () => {
    const of = (key: string): unknown => ({ $get: { from: { $var: 'item' }, path: [key] } });
    expect(() => evaluate({ $sortBy: { over: { $ref: '$.items' }, as: 'item', by: [of('category'), of('price')] } }, source)).toThrow(
      expect.objectContaining({ code: 'E_TYPE', message: expect.stringContaining('$sortBy.by answered a list') }),
    );
    expect(() => evaluate({ $sortBy: { over: { $ref: '$.items' }, as: 'item', by: { $var: 'item' } } }, source)).toThrow(
      expect.objectContaining({ code: 'E_TYPE', message: expect.stringContaining('$sortBy.by answered an object') }),
    );
  });
  // A key that is null, a boolean, or a string among numbers used to compare
  // as equal to everything, so such an item landed wherever the sort left it.
  describe('keys of more than one kind', () => {
    const sorted = (rows: unknown[], dir?: 'asc' | 'desc'): unknown =>
      evaluate({ $pluck: { over: { $sortBy: { over: { $ref: '$' }, as: 'row', by: { $get: { from: { $var: 'row' }, path: ['k'] } }, ...(dir ? { dir } : {}) } }, key: 'id' } }, rows as never);

    it('an item with no key is last, whichever way the sort runs', () => {
      const rows = [{ id: 'a', k: 3 }, { id: 'none', k: null }, { id: 'b', k: 1 }, { id: 'c', k: 2 }];
      expect(sorted(rows)).toEqual(['b', 'c', 'a', 'none']);
      expect(sorted(rows, 'desc')).toEqual(['a', 'c', 'b', 'none']);
    });
    it('false comes before true', () => {
      const rows = [{ id: 'yes', k: true }, { id: 'no', k: false }, { id: 'yes2', k: true }, { id: 'no2', k: false }];
      expect(sorted(rows)).toEqual(['no', 'no2', 'yes', 'yes2']);
      expect(sorted(rows, 'desc')).toEqual(['yes', 'yes2', 'no', 'no2']);
    });
    it('numbers come before strings, and strings before booleans', () => {
      const rows = [{ id: 't', k: true }, { id: 's', k: 'b' }, { id: 'n', k: 10 }, { id: 's0', k: 'a' }, { id: 'n0', k: 2 }, { id: 'none', k: null }];
      expect(sorted(rows)).toEqual(['n0', 'n', 's0', 's', 't', 'none']);
      expect(sorted(rows, 'desc')).toEqual(['t', 's', 's0', 'n', 'n0', 'none']);
    });
    it('is the same order however the list came', () => {
      const rows = [{ id: 1, k: 5 }, { id: 2, k: null }, { id: 3, k: 1 }, { id: 4, k: null }, { id: 5, k: 3 }, { id: 6, k: 2 }, { id: 7, k: 4 }];
      expect(sorted(rows)).toEqual([3, 6, 5, 7, 1, 2, 4]);
      expect(sorted([...rows].reverse())).toEqual([3, 6, 5, 7, 1, 4, 2]);
    });
  });
  it('sorts by two keys as two sorts, the second key first', () => {
    const of = (key: string): unknown => ({ $get: { from: { $var: 'item' }, path: [key] } });
    const byPrice = { $sortBy: { over: { $ref: '$.items' }, as: 'item', by: of('price'), dir: 'desc' } };
    const config = { $pluck: { over: { $sortBy: { over: byPrice, as: 'item', by: of('category') } }, key: 'name' } };
    expect(evaluate(config, source)).toEqual(['Date', 'Apple', 'Banana', 'Carrot']);
  });
});

// A loop sets its variable for each item in a scope of its own. What is
// outside the loop, and what a loop inside it sets, do not meet.
describe("a loop's variables", () => {
  const of = (name: string, ...path: (string | number)[]): unknown => (path.length === 0 ? { $var: name } : { $get: { from: { $var: name }, path } });
  const rows = { rows: [{ id: 1, tags: ['a', 'b'] }, { id: 2, tags: ['c'] }], limit: 1 };

  it('a variable of the same name outside the loop is what it was after it', () => {
    const config = { $with: { let: { x: 'outer' }, value: [{ $map: { over: { $ref: '$.rows' }, as: 'x', body: of('x', 'id') } }, of('x')] } };
    expect(evaluate(config, rows)).toEqual([[1, 2], 'outer']);
  });

  it('a loop inside the body with the same name gives the outer item back when it is done', () => {
    const config = { $map: { over: { $ref: '$.rows' }, as: 'x', body: [{ $map: { over: of('x', 'tags'), as: 'x', body: of('x') } }, of('x', 'id')] } };
    expect(evaluate(config, rows)).toEqual([[['a', 'b'], 1], [['c'], 2]]);
  });

  it('each item is seen by the loops inside its body: filter, sort, group, key, reduce', () => {
    const inner = { over: of('row', 'tags'), as: 'tag' };
    const config = {
      $map: {
        over: { $ref: '$.rows' },
        as: 'row',
        body: {
          id: of('row', 'id'),
          kept: { $filter: { ...inner, when: { $neq: [of('tag'), 'b'] } } },
          sorted: { $sortBy: { ...inner, by: of('tag'), dir: 'desc' } },
          grouped: { $groupBy: { ...inner, key: of('row', 'id') } },
          keyed: { $keyBy: { ...inner, key: of('tag') } },
          joined: { $reduce: { ...inner, acc: 'text', init: { $toString: of('row', 'id') }, body: { $join: { parts: [of('text'), of('tag')], sep: '-' } } } },
        },
      },
    };
    expect(evaluate(config, rows)).toEqual([
      { id: 1, kept: ['a'], sorted: ['b', 'a'], grouped: { 1: ['a', 'b'] }, keyed: { a: 'a', b: 'b' }, joined: '1-a-b' },
      { id: 2, kept: ['c'], sorted: ['c'], grouped: { 2: ['c'] }, keyed: { c: 'c' }, joined: '2-c' },
    ]);
  });

  it('a $reduce whose item and accumulator share a name reads the accumulator, as it did', () => {
    expect(evaluate({ $reduce: { over: [1, 2, 3], as: 'n', acc: 'n', init: 10, body: { $add: [of('n'), 1] } } }, {})).toBe(13);
  });

  it('what a body answers is not changed by the items after it', () => {
    const config = { $map: { over: { $ref: '$.rows' }, as: 'row', body: { $with: { let: { held: of('row') }, value: { row: of('held'), tags: of('held', 'tags') } } } } };
    expect(evaluate(config, rows)).toEqual([{ row: rows.rows[0], tags: ['a', 'b'] }, { row: rows.rows[1], tags: ['c'] }]);
  });
});
