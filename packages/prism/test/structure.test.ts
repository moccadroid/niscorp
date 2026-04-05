import { describe, it, expect } from 'vitest';
import { evaluate } from '../src';

const source = {
  defaults: { color: 'red', size: 'M' },
  overrides: { color: 'blue' },
  items: [
    { name: 'A', type: 'x' },
    { name: 'B', type: 'y' },
    { name: 'C', type: 'x' },
  ],
  obj: { a: 1, b: 2, c: 3 },
};

describe('$merge', () => {
  it('shallow merges objects', () => {
    expect(evaluate({ $merge: [{ $ref: '$.defaults' }, { $ref: '$.overrides' }] }, source))
      .toEqual({ color: 'blue', size: 'M' });
  });
});

describe('$coalesce', () => {
  it('returns first non-null', () => {
    expect(evaluate({ $coalesce: [{ $const: null }, { $const: null }, { $const: 'found' }] }, source)).toBe('found');
  });
  it('returns null if all null', () => {
    expect(evaluate({ $coalesce: [{ $const: null }, { $const: null }] }, source)).toBe(null);
  });
});

describe('$case', () => {
  it('returns first matching branch', () => {
    const config = {
      $case: {
        branches: [
          { when: { $const: false }, then: { $const: 'no' } },
          { when: { $const: true }, then: { $const: 'yes' } },
        ],
        else: { $const: 'fallback' },
      },
    };
    expect(evaluate(config, source)).toBe('yes');
  });

  it('returns else when no match', () => {
    const config = {
      $case: {
        branches: [{ when: { $const: false }, then: { $const: 'no' } }],
        else: { $const: 'fallback' },
      },
    };
    expect(evaluate(config, source)).toBe('fallback');
  });

  it('returns null without else', () => {
    const config = {
      $case: {
        branches: [{ when: { $const: false }, then: { $const: 'no' } }],
      },
    };
    expect(evaluate(config, source)).toBe(null);
  });
});

describe('$entriesOf', () => {
  it('converts object to entries', () => {
    expect(evaluate({ $entriesOf: { $ref: '$.obj' } }, source)).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });
});

describe('$keyBy', () => {
  it('keys by computed value', () => {
    const config = {
      $keyBy: { over: { $ref: '$.items' }, as: 'item', key: { $get: { from: { $var: 'item' }, path: ['name'] } } },
    };
    const result = evaluate(config, source) as any;
    expect(result['A'].name).toBe('A');
    expect(result['C'].name).toBe('C');
  });
});

describe('$groupBy', () => {
  it('groups by computed value', () => {
    const config = {
      $groupBy: { over: { $ref: '$.items' }, as: 'item', key: { $get: { from: { $var: 'item' }, path: ['type'] } } },
    };
    const result = evaluate(config, source) as any;
    expect(result['x']).toHaveLength(2);
    expect(result['y']).toHaveLength(1);
  });
});
