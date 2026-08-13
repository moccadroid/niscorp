export type Raw = { sql: string };
export const raw = (sql: string): Raw => ({ sql });

/** A date, N days from that studio's today. `day(0, studio)` is today there. */
// Nothing here computes a date: it emits SQL and the database works it out, on
// the STUDIO's clock. The studio parameter is required on purpose — an optional
// one with a sensible default is how the server's clock gets back in.
export const day = (offset: number, studio: string): Raw =>
  raw(offset === 0 ? `studio_today('${studio}')` : `studio_today('${studio}') ${offset > 0 ? '+' : '-'} ${Math.abs(offset)}`);

/** A named moment: `at(-1, 19, 30, studio)` is 19:30 yesterday, there. */
export const at = (dayOffset: number, hour: number, minute: number, studio: string): Raw =>
  raw(`studio_today('${studio}') ${dayOffset >= 0 ? '+' : '-'} ${Math.abs(dayOffset)} + interval '${hour} hours ${minute} minutes'`);

/** ISO week key for a dated row — '2026-W32'. Computed by the database, like everything else. */
export const weekKey = (dayOffset: number, studio: string): Raw =>
  raw(`to_char(studio_today('${studio}') ${dayOffset >= 0 ? '+' : '-'} ${Math.abs(dayOffset)}, 'IYYY"-W"IW')`);

export type Val = string | number | boolean | null | Raw;

export const lit = (v: Val): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return v.sql;
  return `'${v.replace(/'/g, "''")}'`;
};

export const insert = (table: string, cols: string[], rows: Val[][]): string =>
  rows.length === 0 ? '' : `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n  ${rows.map((r) => `(${r.map(lit).join(', ')})`).join(',\n  ')};\n`;

// ─── deterministic, not random ───────────────────────────────
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
