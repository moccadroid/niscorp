// Dates are emitted as SQL, never computed in node: a seeded date has to be on
// the same clock as the column defaults and `CURRENT_DATE`.
export type Raw = { sql: string };
export const raw = (sql: string): Raw => ({ sql });

export const day = (offset: number): Raw =>
  raw(offset === 0 ? 'CURRENT_DATE' : `CURRENT_DATE ${offset > 0 ? '+' : '-'} ${Math.abs(offset)}`);

export const ts = (hours: number): Raw => raw(`CURRENT_DATE + interval '${12 + hours} hours'`);

export const at = (dayOffset: number, hour: number, minute = 0): Raw =>
  raw(`CURRENT_DATE ${dayOffset >= 0 ? '+' : '-'} ${Math.abs(dayOffset)} + interval '${hour} hours ${minute} minutes'`);

export const ago = (hours: number, minutes = 0): Raw => raw(`now() - interval '${hours} hours ${minutes} minutes'`);

export const DEFAULTS: Raw = raw('DEFAULT');

export type Val = string | number | boolean | null | Raw;

export const lit = (v: Val): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'object') return v.sql;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${v.replace(/'/g, "''")}'`;
};

export const insert = (table: string, cols: string[], rows: Val[][]): string =>
  rows.length === 0 ? '' : `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n  ${rows.map((r) => `(${r.map(lit).join(', ')})`).join(',\n  ')};\n`;

// The checks assert on the generated rows, and each generator takes its own
// seed so that a row added to one does not shift another's stream.
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

export const between = (next: () => number, min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

export const pick = <T>(next: () => number, items: readonly T[]): T => {
  const chosen = items[Math.floor(next() * items.length)];
  if (chosen === undefined) throw new Error('demo/sql: pick over an empty list');
  return chosen;
};

export const chance = (next: () => number, probability: number): boolean => next() < probability;
