import { describe, it, expect } from 'vitest';
import { occurrencesBetween, zonedParts, zonedToUtc, daysInMonth } from '../src/index';
import type { Clock } from '../src/index';
import { utc } from './support';

// The claim under test: occurrence identity is LOCAL CALENDAR FIELDS, so a
// DST boundary can move the instant a key fires at but can neither mint a
// second key nor lose one.

const vienna = 'Europe/Vienna';
const denver = 'America/Denver';

const monthly = (day: number, at: string, tz: string): Clock => ({ every: 'month', on: day, at, tz });
const daily = (at: string, tz: string): Clock => ({ every: 'day', at, tz });

describe('zoned time', () => {
  it('resolves a wall-clock time to the instant it names', () => {
    // 03:00 Vienna in January is CET (UTC+1).
    expect(zonedToUtc({ year: 2026, month: 1, day: 15 }, 3, 0, vienna)).toBe(utc('2026-01-15T02:00:00Z'));
    // …and in July is CEST (UTC+2). Same wall clock, different instant.
    expect(zonedToUtc({ year: 2026, month: 7, day: 15 }, 3, 0, vienna)).toBe(utc('2026-07-15T01:00:00Z'));
  });

  it('means 3am LOCAL in every zone', () => {
    const atVienna = zonedToUtc({ year: 2026, month: 1, day: 15 }, 3, 0, vienna);
    const atDenver = zonedToUtc({ year: 2026, month: 1, day: 15 }, 3, 0, denver);
    expect(atVienna).not.toBe(atDenver);
    expect(zonedParts(atVienna, vienna).hour).toBe(3);
    expect(zonedParts(atDenver, denver).hour).toBe(3);
  });

  it('takes the FIRST occurrence of an ambiguous fall-back time', () => {
    // 2026-10-25: Vienna falls back 03:00 CEST → 02:00 CET, so 02:30 happens
    // twice. The earlier instant is 00:30Z; the later is 01:30Z.
    expect(zonedToUtc({ year: 2026, month: 10, day: 25 }, 2, 30, vienna)).toBe(utc('2026-10-25T00:30:00Z'));
  });

  it('shifts an erased spring-forward time past the gap', () => {
    // 2026-03-29: Vienna springs 02:00 CET → 03:00 CEST, so 02:30 never
    // exists. Temporal's `compatible` disambiguation shifts forward.
    const resolved = zonedToUtc({ year: 2026, month: 3, day: 29 }, 2, 30, vienna);
    expect(resolved).toBe(utc('2026-03-29T01:30:00Z'));
    expect(zonedParts(resolved, vienna).hour).toBe(3);
  });
});

describe('occurrences', () => {
  it('keys a monthly run by year-month, once per month', () => {
    // 03:00 Vienna on Jan 1 is 02:00Z — inside the window, so January counts.
    const found = occurrencesBetween(monthly(1, '03:00', vienna), utc('2026-01-01T00:00:00Z'), utc('2026-04-02T00:00:00Z'), 50);
    expect(found.map((occurrence) => occurrence.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });

  it('crosses a DST boundary without minting or losing a key', () => {
    // March 2026 contains Vienna's spring-forward. A daily 03:00 run must
    // produce exactly one key per local date across it.
    const found = occurrencesBetween(daily('03:00', vienna), utc('2026-03-27T00:00:00Z'), utc('2026-03-31T23:00:00Z'), 50);
    expect(found.map((occurrence) => occurrence.key)).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ]);
    expect(new Set(found.map((occurrence) => occurrence.key)).size).toBe(found.length);
  });

  it('clamps day-31 to month end — February bills on the 28th', () => {
    const found = occurrencesBetween(monthly(31, '03:00', vienna), utc('2026-01-31T12:00:00Z'), utc('2026-03-31T23:00:00Z'), 50);
    expect(found.map((occurrence) => occurrence.key)).toEqual(['2026-02', '2026-03']);
    expect(zonedParts(found[0]?.at ?? 0, vienna).day).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('is half-open at the start, so a watermark can advance without re-minting', () => {
    const boundary = zonedToUtc({ year: 2026, month: 5, day: 1 }, 3, 0, vienna);
    const found = occurrencesBetween(monthly(1, '03:00', vienna), boundary, boundary + 86_400_000, 50);
    expect(found).toEqual([]);
  });

  it('handles weekly and yearly', () => {
    const weekly = occurrencesBetween({ every: 'week', on: 'mon', at: '09:00', tz: vienna }, utc('2026-06-01T00:00:00Z'), utc('2026-06-30T00:00:00Z'), 50);
    expect(weekly.map((occurrence) => occurrence.key)).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
      '2026-06-29',
    ]);
    const yearly = occurrencesBetween({ every: 'year', on: '01-01', at: '00:00', tz: vienna }, utc('2025-06-01T00:00:00Z'), utc('2027-06-01T00:00:00Z'), 50);
    expect(yearly.map((occurrence) => occurrence.key)).toEqual(['2026', '2027']);
  });

  it('fires a one-shot exactly once, inside its window', () => {
    const once: Clock = { at: '2026-09-14T09:00', tz: vienna };
    expect(occurrencesBetween(once, utc('2026-09-13T00:00:00Z'), utc('2026-09-15T00:00:00Z'), 5)).toHaveLength(1);
    expect(occurrencesBetween(once, utc('2026-09-15T00:00:00Z'), utc('2026-09-20T00:00:00Z'), 5)).toHaveLength(0);
  });
});
