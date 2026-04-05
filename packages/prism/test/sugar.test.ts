import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = {
  numbers: [10, 20, 30, 40],
  items: [
    { name: 'Alice', score: 90 },
    { name: 'Bob', score: 70 },
    { name: 'Carol', score: 85 },
  ],
  words: ['hello', 'world', 'helicopter', 'wonder'],
};

describe('$sum', () => {
  it('sums numbers', () => {
    expect(evaluate({ $sum: { over: { $ref: '$.numbers' } } }, source)).toBe(100);
  });
});

describe('$count', () => {
  it('counts elements', () => {
    expect(evaluate({ $count: { over: { $ref: '$.numbers' } } }, source)).toBe(4);
  });
});

describe('$avg', () => {
  it('averages numbers', () => {
    expect(evaluate({ $avg: { over: { $ref: '$.numbers' } } }, source)).toBe(25);
  });
});

describe('$min', () => {
  it('finds minimum', () => {
    expect(evaluate({ $min: { over: { $ref: '$.numbers' } } }, source)).toBe(10);
  });
});

describe('$max', () => {
  it('finds maximum', () => {
    expect(evaluate({ $max: { over: { $ref: '$.numbers' } } }, source)).toBe(40);
  });
});

describe('$pluck', () => {
  it('extracts field from each', () => {
    expect(evaluate({ $pluck: { over: { $ref: '$.items' }, key: 'name' } }, source)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

describe('$take', () => {
  it('takes first N', () => {
    expect(evaluate({ $take: { from: { $ref: '$.numbers' }, count: 2 } }, source)).toEqual([10, 20]);
  });
});

describe('$drop', () => {
  it('drops first N', () => {
    expect(evaluate({ $drop: { from: { $ref: '$.numbers' }, count: 2 } }, source)).toEqual([30, 40]);
  });
});

describe('$flatMap', () => {
  it('maps and flattens', () => {
    const config = {
      $flatMap: {
        over: { $const: [[1, 2], [3, 4]] },
        as: 'arr',
        body: { $var: 'arr' },
      },
    };
    expect(evaluate(config, source)).toEqual([1, 2, 3, 4]);
  });
});

describe('$match', () => {
  it('filters by string containment', () => {
    const config = {
      $match: {
        over: { $ref: '$.words' },
        as: 'w',
        search: { $const: 'hel' },
      },
    };
    expect(evaluate(config, source)).toEqual(['hello', 'helicopter']);
  });
});
