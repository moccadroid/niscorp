import { WEEKDAYS, isRecurring } from '../schemas';
import type { Clock, ClockRecurring } from '../schemas';

// ═══════════════════════════════════════════════════════════════
// Occurrences — local calendar fields, never instants
//
// A DST boundary can move the INSTANT a key fires at; it cannot
// mint a second key or lose one. `2026-03` exists exactly once
// whatever the clock does, so the double-fire and the silent skip
// are structurally impossible rather than carefully avoided — and
// catch-up is decidable, because the missed keys are enumerable.
//
// Zero dependencies: timezone resolution rides the platform's own
// IANA data through Intl.
// ═══════════════════════════════════════════════════════════════

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
export type LocalDay = { year: number; month: number; day: number };
export type Occurrence = { key: string; at: number };

const HALF_DAY_MS = 43_200_000;
const DAY_MS = 86_400_000;
// Ten years of local days. A bound, not a policy: catch-up covers outages
// and deliberate backfill is its own (deferred) verb.
const MAX_DAYS_SCANNED = 3_700;

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (tz: string): Intl.DateTimeFormat => {
  const cached = FORMATTERS.get(tz);
  if (cached !== undefined) return cached;
  const built = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  FORMATTERS.set(tz, built);
  return built;
};

export const zonedParts = (instant: number, tz: string): LocalParts => {
  const parts = formatterFor(tz).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found === undefined ? 0 : Number(found.value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
};

const offsetAt = (instant: number, tz: string): number => {
  const parts = zonedParts(instant, tz);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asIfUtc - Math.floor(instant / 1000) * 1000;
};

const rendersAs = (instant: number, tz: string, day: LocalDay, hour: number, minute: number): boolean => {
  const parts = zonedParts(instant, tz);
  return (
    parts.year === day.year &&
    parts.month === day.month &&
    parts.day === day.day &&
    parts.hour === hour &&
    parts.minute === minute
  );
};

// A local wall-clock time → the instant it names.
//
// The two edges are DECIDED, not discovered. Probing the offset half a day
// either side is what surfaces both candidates across a transition; probing
// at the guess alone finds only one, and silently returns the wrong side of
// a fall-back. Ambiguous (fall back) → the FIRST occurrence. Erased (spring
// forward) → shifted forward past the gap. Both match Temporal's
// `disambiguation: 'compatible'`, so behaviour here is not tide's invention.
export const zonedToUtc = (day: LocalDay, hour: number, minute: number, tz: string): number => {
  const guess = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  const before = offsetAt(guess - HALF_DAY_MS, tz);
  const after = offsetAt(guess + HALF_DAY_MS, tz);
  const candidates = before === after ? [guess - before] : [guess - before, guess - after];
  const valid = candidates.filter((candidate) => rendersAs(candidate, tz, day, hour, minute));
  return valid.length > 0 ? Math.min(...valid) : Math.max(...candidates);
};

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const weekdayOf = (day: LocalDay): string => {
  const index = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
  // getUTCDay is Sunday-first; WEEKDAYS is Monday-first.
  return WEEKDAYS[(index + 6) % 7] ?? 'mon';
};

const splitInts = (value: string, separator: string): number[] =>
  value.split(separator).map((part) => Number(part));

const at2 = (values: readonly number[], index: number): number => values[index] ?? 0;

const nextDay = (day: LocalDay): LocalDay => {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day) + DAY_MS);
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
};

const ordinalOf = (day: LocalDay): number => day.year * 10_000 + day.month * 100 + day.day;

const pad2 = (value: number): string => String(value).padStart(2, '0');

// Day-31 clamps to month end: February bills on the 28th, because
// "skip February" is never what a billing rule means. A yearly Feb-29
// clamps the same way, for the same reason.
const isDueOn = (clock: ClockRecurring, day: LocalDay): boolean => {
  if (clock.every === 'day') return true;
  if (clock.every === 'week') return weekdayOf(day) === clock.on;
  if (clock.every === 'month')
    return typeof clock.on === 'number' && day.day === Math.min(clock.on, daysInMonth(day.year, day.month));
  if (typeof clock.on !== 'string') return false;
  const parts = splitInts(clock.on, '-');
  const month = at2(parts, 0);
  const dayOfMonth = at2(parts, 1);
  return day.month === month && day.day === Math.min(dayOfMonth, daysInMonth(day.year, month));
};

export const occurrenceKey = (clock: ClockRecurring, day: LocalDay): string => {
  if (clock.every === 'year') return String(day.year);
  if (clock.every === 'month') return `${day.year}-${pad2(day.month)}`;
  return `${day.year}-${pad2(day.month)}-${pad2(day.day)}`;
};

// Every occurrence in (after, through]. Half-open at the start so a
// materialization watermark can advance without re-minting its own edge.
export const occurrencesBetween = (clock: Clock, after: number, through: number, cap: number): Occurrence[] => {
  if (through <= after || cap <= 0) return [];

  if (!isRecurring(clock)) {
    const [date = '', time = ''] = clock.at.split('T');
    const ymd = splitInts(date, '-');
    const hm = splitInts(time, ':');
    const at = zonedToUtc(
      { year: at2(ymd, 0), month: at2(ymd, 1), day: at2(ymd, 2) },
      at2(hm, 0),
      at2(hm, 1),
      clock.tz,
    );
    return at > after && at <= through ? [{ key: clock.at, at }] : [];
  }

  const time = splitInts(clock.at, ':');
  const hour = at2(time, 0);
  const minute = at2(time, 1);
  const start = zonedParts(after, clock.tz);
  const end = zonedParts(through, clock.tz);
  const endOrdinal = ordinalOf(end);

  const found: Occurrence[] = [];
  let cursor: LocalDay = { year: start.year, month: start.month, day: start.day };
  let scanned = 0;

  while (ordinalOf(cursor) <= endOrdinal && scanned < MAX_DAYS_SCANNED) {
    scanned += 1;
    if (isDueOn(clock, cursor)) {
      const at = zonedToUtc(cursor, hour, minute, clock.tz);
      if (at > after && at <= through) {
        found.push({ key: occurrenceKey(clock, cursor), at });
        if (found.length >= cap) break;
      }
    }
    cursor = nextDay(cursor);
  }

  return found;
};
