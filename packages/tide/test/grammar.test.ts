import { describe, expect, it } from 'vitest';
import { prepare } from '@niscorp/strata';
import { ClockTriggerSchema, occurrencesBetween } from '../src/index';
import { TIDE_GRAMMAR, TIDE_SCHEMAS } from '../src/migrations';
import { utc } from './support';

const vienna = 'Europe/Vienna';
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

describe('the grammar — a reflex and its draft as documents a host keeps', () => {
  it('parses as a strata sequence, its addition rewriting no document', async () => {
    const [prepared] = await prepare([TIDE_GRAMMAR]);
    expect(prepared?.id).toBe('nisc.tide');
    expect(TIDE_GRAMMAR.migrations).toHaveLength(1);
    expect(TIDE_GRAMMAR.migrations[0]?.steps).toEqual([]);
    expect(Object.keys(TIDE_SCHEMAS)).toEqual(['nisc.tide/reflex', 'nisc.tide/draft']);
  });
});

describe('a weekly clock on several weekdays', () => {
  it('fires on each day it names, each its own occurrence', () => {
    const found = occurrencesBetween({ every: 'week', on: [...weekdays], at: '07:30', tz: vienna }, utc('2026-06-01T00:00:00Z'), utc('2026-06-08T00:00:00Z'), 50);
    expect(found.map((occurrence) => occurrence.key)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
    expect(found[0]?.at).toBe(utc('2026-06-01T05:30:00Z'));
  });

  it('takes a list of different weekdays, and only on a weekly clock', () => {
    const clock = (every: string, on: unknown) => ClockTriggerSchema.safeParse({ clock: { every, on, at: '07:30', tz: vienna } }).success;
    expect(clock('week', [...weekdays])).toBe(true);
    expect(clock('week', ['sat', 'sun'])).toBe(true);
    expect(clock('week', [])).toBe(false);
    expect(clock('week', ['mon', 'mon'])).toBe(false);
    expect(clock('week', ['mon', 'someday'])).toBe(false);
    expect(clock('month', ['mon'])).toBe(false);
    expect(clock('day', ['mon'])).toBe(false);
  });
});
