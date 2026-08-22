import { describe, it, expect } from 'vitest';
import { evaluate, PrismError } from '../src';

const source = {
  date: '2024-06-15T12:00:00Z',
  start: '2024-01-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  timestamp: 1718452800000,
};

describe('$date', () => {
  it('formats as ISO by default', () => {
    const result = evaluate({ $date: { value: { $ref: '$.date' } } }, source);
    expect(typeof result).toBe('string');
    expect(result).toContain('2024-06-15');
  });

  it('formats with custom format', () => {
    const result = evaluate({ $date: { value: { $ref: '$.date' }, format: 'YYYY-MM-DD' } }, source);
    expect(result).toBe('2024-06-15');
  });

  it('formats in UTC', () => {
    const result = evaluate({ $date: { value: { $ref: '$.date' }, format: 'YYYY-MM-DD HH:mm', utc: true } }, source);
    expect(result).toBe('2024-06-15 12:00');
  });

  it('handles timestamps', () => {
    const result = evaluate({ $date: { value: { $ref: '$.timestamp' }, format: 'YYYY' } }, source);
    expect(result).toBe('2024');
  });

  it('throws on invalid date', () => {
    expect(() => evaluate({ $date: { value: { $const: 'not-a-date' } } }, source)).toThrow(PrismError);
  });

  it('throws on non-string/number', () => {
    expect(() => evaluate({ $date: { value: { $const: true } } }, source)).toThrow(PrismError);
  });
});

describe('$dateAdd', () => {
  it('adds days', () => {
    const result = evaluate({ $dateAdd: { date: { $ref: '$.date' }, amount: 5, unit: 'day' } }, source);
    expect(result).toContain('2024-06-20');
  });

  it('adds months', () => {
    const result = evaluate({ $dateAdd: { date: { $ref: '$.start' }, amount: 3, unit: 'month' } }, source) as string;
    // 2024-01-01 + 3 months = 2024-04-01 (but timezone may shift the day)
    expect(result).toMatch(/2024-0[34]/);
  });

  it('subtracts with negative amount', () => {
    const result = evaluate({ $dateAdd: { date: { $ref: '$.date' }, amount: -15, unit: 'day' } }, source);
    expect(result).toContain('2024-05-31');
  });
});

describe('$dateDiff', () => {
  it('calculates day difference', () => {
    const result = evaluate({
      $dateDiff: { from: { $ref: '$.start' }, to: { $ref: '$.end' }, unit: 'day' },
    }, source);
    expect(result).toBe(365);
  });

  it('calculates month difference', () => {
    const result = evaluate({
      $dateDiff: { from: { $ref: '$.start' }, to: { $ref: '$.end' }, unit: 'month' },
    }, source);
    expect(result).toBe(11);
  });

  it('returns 0 for same date', () => {
    const result = evaluate({
      $dateDiff: { from: { $ref: '$.date' }, to: { $ref: '$.date' }, unit: 'day' },
    }, source);
    expect(result).toBe(0);
  });
});

// ── the timezone regression ─────────────────────────────────
//
// A DATE IS NOT A TIMESTAMP. "2026-06-01" names a calendar day, and dayjs
// parses a bare date at LOCAL midnight — so `+1 month, -1 day` used to come
// back "2026-06-29T22:00:00.000Z" on a UTC+2 machine: the wrong day, wearing
// an instant's clothes. Range filters built that way silently dropped their
// boundary day. These run under a non-UTC TZ on purpose; under UTC the bug
// is invisible.
describe('$dateAdd keeps calendar days calendar days', () => {
  it('end-of-month: first + 1 month - 1 day is the last day, not the night before', () => {
    const monthEnd = {
      $dateAdd: {
        date: { $dateAdd: { date: { $ref: '$.first' }, unit: 'month', amount: 1 } },
        unit: 'day',
        amount: -1,
      },
    };
    expect(evaluate(monthEnd, { first: '2026-06-01' })).toBe('2026-06-30');
    expect(evaluate(monthEnd, { first: '2026-07-01' })).toBe('2026-07-31');
    expect(evaluate(monthEnd, { first: '2026-02-01' })).toBe('2026-02-28');
  });

  it('a date-only input returns a date-only string', () => {
    expect(evaluate({ $dateAdd: { date: { $ref: '$.d' }, unit: 'day', amount: 7 } }, { d: '2026-08-22' })).toBe('2026-08-29');
  });

  it('a full timestamp still returns an instant', () => {
    const out = evaluate({ $dateAdd: { date: { $ref: '$.d' }, unit: 'hour', amount: 3 } }, { d: '2026-08-22T10:00:00.000Z' });
    expect(String(out)).toContain('T');
    expect(String(out)).toContain('13:00');
  });
});
