// Run: pnpm --filter lyra exec tsx src/dev/clock-check.ts
import { loadDirectory, studioToday } from '@lyra/server/users';
import { ok, report, runtime } from './world';

const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  (await runtime.db.query(sql, params)).rows[0] as T | undefined;

// ── two studios that can never share a date ──────────────────
await runtime.db.query(`
  INSERT INTO studios (id, name, slug, kind, timezone)
  VALUES ('st_early', 'Dawn Studio', 'dawn', 'yoga', 'Pacific/Kiritimati'),
         ('st_late',  'Dusk Studio', 'dusk', 'yoga', 'Pacific/Niue')
  ON CONFLICT (id) DO UPDATE SET timezone = EXCLUDED.timezone
`);

// The server's half of the clock is a cache of a database fact, so a new studio
// has to reach it. This is the reload a deployment does.
await loadDirectory(runtime.pool);

const days = await one<{ early: string; late: string; server: string }>(`
  SELECT studio_today('st_early')::text AS early,
         studio_today('st_late')::text  AS late,
         CURRENT_DATE::text             AS server
`);

ok('a studio has its own day', days !== undefined && days.early !== days.late, `${days?.early} vs ${days?.late}`);
ok(
  '...and it is not the server’s day for everybody',
  days !== undefined && (days.early !== days.server || days.late !== days.server),
  `server says ${days?.server} — at least one studio is on another date, always`,
);

// ── the two halves agree ─────────────────────────────────────
const studios = await runtime.db.query<{ id: string; sql_day: string }>(
  `SELECT id, studio_today(id)::text AS sql_day FROM studios ORDER BY id`,
);
const disagreements = studios.rows
  .map((row) => ({ id: row.id, sql: row.sql_day, js: studioToday(row.id) }))
  .filter((row) => row.sql !== row.js);

ok(
  'the database and the server agree on every studio’s day',
  disagreements.length === 0,
  disagreements.length === 0 ? `${studios.rows.length} studios` : disagreements.map((d) => `${d.id}: sql ${d.sql} vs js ${d.js}`).join(', '),
);

// ── and the triggers use it ──────────────────────────────────
const off = days !== undefined && days.early !== days.server ? { id: 'st_early', day: days.early } : { id: 'st_late', day: days?.late ?? '' };
ok('a studio whose day is not the server’s exists to test with', off.day !== days?.server, `${off.id} is on ${off.day}, server on ${days?.server}`);

await runtime.db.query(
  `INSERT INTO programs (id, studio_id, name, colour) VALUES ('pr_off', $1, 'Sunrise', 'amber')
   ON CONFLICT (id) DO NOTHING`,
  [off.id],
);

const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();
await runtime.db.query(
  `INSERT INTO class_templates (id, studio_id, program_id, name, weekday, starts_at, duration_mins, capacity)
   VALUES ('ct_off_today',    $1, 'pr_off', 'Sunrise', $2, '06:00', 60, 10),
          ('ct_off_tomorrow', $1, 'pr_off', 'Sunset',  $3, '19:00', 60, 10)
   ON CONFLICT (id) DO NOTHING`,
  [off.id, weekdayOf(off.day), weekdayOf(addDays(off.day, 1))],
);

const earliestOf = async (template: string): Promise<string> =>
  (await one<{ d: string }>(`SELECT min(held_on)::text AS d FROM class_sessions WHERE template_id = $1`, [template]))?.d ?? '';

const onItsDay = await earliestOf('ct_off_today');
const onTheNext = await earliestOf('ct_off_tomorrow');

ok('a slot generates classes', onItsDay !== '' && onTheNext !== '', `${onItsDay} and ${onTheNext}`);
ok(
  '...a slot on the studio’s own weekday waits a week',
  onItsDay === addDays(off.day, 7),
  `${onItsDay}; it is ${off.day} there and ${days?.server} on the server`,
);
ok(
  '...and one on tomorrow’s weekday is tomorrow — THERE',
  onTheNext === addDays(off.day, 1),
  `${onTheNext} against ${off.day} + 1`,
);

function addDays(iso: string, amount: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

// ── why `starts_at` is TEXT and not TIME ─────────────────────
const times = await runtime.db.query<{ a: string }>(
  `SELECT starts_at a FROM class_sessions ORDER BY starts_at ASC`,
);
const listed = times.rows.map((r) => r.a);
ok('there are times to compare', listed.length > 5, `${listed.length} sessions`);

const asMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const byClock = [...listed].map(asMinutes);
ok('...and text order is clock order', byClock.every((m, i) => i === 0 || m >= (byClock[i - 1] ?? 0)), 'zero-padded HH:MM sorts as TIME does');

const malformed = await runtime.db.query<{ n: string }>(
  `SELECT count(*) n FROM class_sessions WHERE starts_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
);
ok('...because every value is zero-padded', Number(malformed.rows[0]?.n ?? -1) === 0, 'enforced by a CHECK, not by convention');

const refused = await runtime.db
  .query(`INSERT INTO class_templates (id, studio_id, program_id, name, weekday, starts_at) VALUES ('ct_bad', 'st_lumen', 'pr_flow', 'Bad', 1, '9:30')`)
  .then(() => false)
  .catch(() => true);
ok('...and the database refuses one that is not', refused, "'9:30' would sort after '19:00'");

report('one clock: the studio owns its day, and the database and the server compute it the same way.');
