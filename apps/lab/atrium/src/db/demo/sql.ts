// The demo dataset's SQL primitives — value literals, INSERT assembly, and the
// two things a hotel dataset cannot be written without: dates on the DATABASE's
// clock, and a random number generator that is not random.
//
// ─── ONE CLOCK, AND IT IS THE DATABASE'S ─────────────────────
// The dataset shifts with the wall clock (a demo must never be dated). It would
// be natural to compute the shift in node and emit date LITERALS, and that is
// exactly what this file exists to prevent: it puts two clocks in the app —
// node's, which produces seeded dates, and the database's, which produces every
// column default (`wake_calls.call_on` is `(now() + interval '1 day')::date`)
// and every `CURRENT_DATE`.
//
// Two clocks disagree. Deriving from `toISOString()` means UTC, so between local
// midnight and UTC midnight a seeded "tomorrow" and a defaulted "tomorrow" are
// different days — the call sheet sorts a 06:30 call after a 07:00 one, and
// "arriving today" is off by one. A local-date helper in node fixes tonight and
// leaves the second clock, which fails again the moment the server and the
// database sit in different zones. Normal in production.
//
// So nothing here computes a date: it emits SQL and the database works it out,
// on the same clock as its own defaults. Nothing can drift because there is
// nothing left to keep in step.

export type Raw = { sql: string };
export const raw = (sql: string): Raw => ({ sql });

/** A date, N days from today. `day(0)` is today. */
export const day = (offset: number): Raw =>
  raw(offset === 0 ? 'CURRENT_DATE' : `CURRENT_DATE ${offset > 0 ? '+' : '-'} ${Math.abs(offset)}`);

/** A timestamp, N hours either side of NOON today — seeded history at sensible times of day reads like history. */
export const ts = (hours: number): Raw => raw(`CURRENT_DATE + interval '${12 + hours} hours'`);

/**
 * A named moment: `at(-1, 23, 10)` is 23:10 yesterday. The authored beats of the
 * demo are written this way because "she wrote at ten past eleven last night" is
 * the fact, and deriving it from an offset-from-noon is arithmetic nobody should
 * have to do while reading a dataset.
 */
export const at = (dayOffset: number, hour: number, minute = 0): Raw =>
  raw(`CURRENT_DATE ${dayOffset >= 0 ? '+' : '-'} ${Math.abs(dayOffset)} + interval '${hour} hours ${minute} minutes'`);

/**
 * An ELAPSED moment: `ago(4, 20)` is four hours and twenty minutes before now.
 *
 * The difference from `at` is the whole reason both exist. Structural history —
 * a room night posted on Monday, an issue resolved a fortnight ago — happened at
 * a time of day, and `at` says so. But the live edges of the demo are facts
 * about ELAPSED time: "no reply in four hours", "she disputed that charge forty
 * minutes ago". Pin those to a time of day and they are only true if the demo
 * boots at the hour they were written for, and a stand at a trade show opens at
 * nine and is still running at six.
 */
export const ago = (hours: number, minutes = 0): Raw => raw(`now() - interval '${hours} hours ${minutes} minutes'`);

/**
 * Let the column's own DEFAULT decide.
 *
 * Not the same thing as `null`, and the difference is a foreign key away from
 * biting: a generated primary key column is `DEFAULT gen_random_uuid()::text`
 * and NOT NULL, so sending an explicit null is a constraint violation rather
 * than a request for the default. Rows the demo names carry authored ids; rows
 * that are only there to make a list a list use this.
 */
export const DEFAULTS: Raw = raw('DEFAULT');

export type Val = string | number | boolean | null | Raw;

export const lit = (v: Val): string => {
  if (v === null) return 'NULL';
  // SQL, not a value — the database works it out.
  if (typeof v === 'object') return v.sql;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${v.replace(/'/g, "''")}'`;
};

export const insert = (table: string, cols: string[], rows: Val[][]): string =>
  rows.length === 0 ? '' : `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n  ${rows.map((r) => `(${r.map(lit).join(', ')})`).join(',\n  ')};\n`;

// ─── DETERMINISTIC, NOT RANDOM ───────────────────────────────
// The background of the dataset is generated: sixty departed stays, a hundred
// folio lines, the resolved issues that make a fault look recurring. Writing
// those by hand is pointless — nobody reads them, they only need to be there and
// to be plausible.
//
// But they must be the SAME every boot. Twelve headless checks assert on counts
// and totals, and a dataset that reshuffled itself would make the suite's
// failures meaningless. So: mulberry32, seeded per generator with its own
// constant, so adding a row to one generator never shifts another's stream.
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** An integer in [min, max]. */
export const between = (next: () => number, min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

/** One of them. */
export const pick = <T>(next: () => number, items: readonly T[]): T => {
  const chosen = items[Math.floor(next() * items.length)];
  if (chosen === undefined) throw new Error('demo/sql: pick over an empty list');
  return chosen;
};

/** A weighted flag — `chance(next, 0.3)` is true three times in ten. */
export const chance = (next: () => number, probability: number): boolean => next() < probability;
