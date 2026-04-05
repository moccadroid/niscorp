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
