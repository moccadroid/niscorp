import { describe, it, expect } from 'vitest';
import { evaluate, evaluateSafe, PrismError } from '../src';

const source = { items: [] as number[], numbers: [5, 3, 8, 1] };

describe('empty array edge cases', () => {
  it('$map on empty array returns empty', () => {
    expect(evaluate({ $map: { over: { $ref: '$.items' }, as: 'x', body: { $var: 'x' } } }, source)).toEqual([]);
  });

  it('$filter on empty array returns empty', () => {
    expect(evaluate({ $filter: { over: { $ref: '$.items' }, as: 'x', when: { $const: true } } }, source)).toEqual([]);
  });

  it('$reduce on empty array returns init', () => {
    expect(evaluate({
      $reduce: { over: { $ref: '$.items' }, as: 'x', init: { $const: 0 }, body: { $add: [{ $var: 'acc' }, { $var: 'x' }] } },
    }, source)).toBe(0);
  });

  it('$sum on empty array returns 0', () => {
    expect(evaluate({ $sum: { over: { $ref: '$.items' } } }, source)).toBe(0);
  });

  it('$count on empty array returns 0', () => {
    expect(evaluate({ $count: { over: { $ref: '$.items' } } }, source)).toBe(0);
  });

  it('$min on empty array returns null', () => {
    expect(evaluate({ $min: { over: { $ref: '$.items' } } }, source)).toBe(null);
  });

  it('$max on empty array returns null', () => {
    expect(evaluate({ $max: { over: { $ref: '$.items' } } }, source)).toBe(null);
  });

  it('$unique on empty array returns empty', () => {
    expect(evaluate({ $unique: { $ref: '$.items' } }, source)).toEqual([]);
  });

  it('$flatten on empty array returns empty', () => {
    expect(evaluate({ $flatten: { $ref: '$.items' } }, source)).toEqual([]);
  });
});

describe('nested operations', () => {
  it('map + filter + reduce compose', () => {
    const config = {
      $reduce: {
        over: {
          $filter: {
            over: {
              $map: {
                over: { $ref: '$.numbers' },
                as: 'n',
                body: { $mul: [{ $var: 'n' }, { $const: 2 }] },
              },
            },
            as: 'n',
            when: { $gt: [{ $var: 'n' }, { $const: 5 }] },
          },
        },
        as: 'n',
        init: { $const: 0 },
        body: { $add: [{ $var: 'acc' }, { $var: 'n' }] },
      },
    };
    // numbers: [5,3,8,1] → doubled: [10,6,16,2] → filtered >5: [10,6,16] → sum: 32
    expect(evaluate(config, source)).toBe(32);
  });

  it('$with inside $map', () => {
    const config = {
      $map: {
        over: { $ref: '$.numbers' },
        as: 'n',
        body: {
          $with: {
            let: { doubled: { $mul: [{ $var: 'n' }, { $const: 2 }] } },
            value: { $add: [{ $var: 'doubled' }, { $const: 1 }] },
          },
        },
      },
    };
    expect(evaluate(config, source)).toEqual([11, 7, 17, 3]);
  });
});

describe('evaluateSafe error containment', () => {
  it('catches type errors', () => {
    const result = evaluateSafe({ $add: [{ $const: 'a' }, { $const: 1 }] }, {});
    expect(result.ok).toBe(false);
  });

  it('catches division by zero', () => {
    const result = evaluateSafe({ $div: [{ $const: 1 }, { $const: 0 }] }, {});
    expect(result.ok).toBe(false);
  });
});

describe('$case with evaluated conditions', () => {
  it('evaluates conditions dynamically', () => {
    const config = {
      $case: {
        branches: [
          { when: { $gt: [{ $ref: '$.numbers[0]' }, { $const: 10 }] }, then: { $const: 'big' } },
          { when: { $gt: [{ $ref: '$.numbers[0]' }, { $const: 3 }] }, then: { $const: 'medium' } },
        ],
        else: { $const: 'small' },
      },
    };
    // numbers[0] = 5, 5 > 10 = false, 5 > 3 = true → 'medium'
    expect(evaluate(config, { numbers: [5] })).toBe('medium');
  });
});

describe('$coalesce with evaluated nodes', () => {
  it('skips null refs and returns first non-null', () => {
    const s = { a: null, b: null, c: 'found' };
    const config = { $coalesce: [{ $ref: '$.a' }, { $ref: '$.b' }, { $ref: '$.c' }] };
    expect(evaluate(config, s)).toBe('found');
  });
});
