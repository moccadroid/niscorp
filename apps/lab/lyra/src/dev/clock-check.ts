// Clock check — one clock, and it belongs to the studio.
//
// WHAT WENT WRONG. This application had three notions of "what day is it":
// Postgres CURRENT_DATE (the server's day) decided what a trigger thought
// "future" meant and how far ahead classes were generated; a JS-derived value
// decided what a screen asked for; and tide carried its own logical now. The
// first two agreed until a UTC boundary fell between them — and then a class
// seeded "today" was invisible to a screen asking for today. Silently. With
// every check green, because every check ran in one timezone and asked the
// database the same way the database answered.
//
// That last part is why this file exists. A check that computes "today" the
// same way the code under test does cannot catch the code being wrong about
// today. The assertions below are built so that they do not depend on WHEN they
// run — no "this passes except around midnight".
//
// Run: pnpm --filter lyra exec tsx src/dev/clock-check.ts
import { loadDirectory, studioToday } from '@lyra/server/users';
import { ok, report, runtime } from './world';

const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  (await runtime.db.query(sql, params)).rows[0] as T | undefined;

// ── two studios that can never share a date ──────────────────
//
// Kiritimati is UTC+14 and Niue is UTC-11: twenty-five hours apart, so their
// calendar dates differ at EVERY instant. No time-of-day flake is possible —
// if these two ever agree, the clock is not per-studio.
await runtime.db.query(`
  INSERT INTO studios (id, name, slug, kind, timezone)
  VALUES ('st_early', 'Dawn Studio', 'dawn', 'yoga', 'Pacific/Kiritimati'),
         ('st_late',  'Dusk Studio', 'dusk', 'yoga', 'Pacific/Niue')
  ON CONFLICT (id) DO UPDATE SET timezone = EXCLUDED.timezone
`);

// The server's half of the clock is a cache of a database fact, so a new
// studio has to reach it. This is the reload a deployment does; the assertion
// below is that nothing is missed by it.
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

// ── THE TWO HALVES AGREE ─────────────────────────────────────
//
// The database computes the studio's day for its triggers; the server computes
// it for the engine to stamp into every read. Two implementations of one idea
// is exactly the arrangement that drifted before, so this is the assertion that
// matters most: they must return the same string for every studio, including
// the two extremes above.
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

// ── AND THE TRIGGERS USE IT ──────────────────────────────────
//
// Generation is bounded by the STUDIO's day. Proving that needs a studio whose
// day is not the server's — anchoring it on a studio that happens to agree
// today asserts nothing, which is what the first version of this did: putting
// CURRENT_DATE back into the trigger left it green.
//
// One of these two always differs, because they are twenty-five hours apart,
// so this picks the one that does. Deterministic at every instant, and the
// assertion actually bites.
const off = days !== undefined && days.early !== days.server ? { id: 'st_early', day: days.early } : { id: 'st_late', day: days?.late ?? '' };
ok('a studio whose day is not the server’s exists to test with', off.day !== days?.server, `${off.id} is on ${off.day}, server on ${days?.server}`);

await runtime.db.query(
  `INSERT INTO programs (id, studio_id, name, colour) VALUES ('pr_off', $1, 'Sunrise', 'amber')
   ON CONFLICT (id) DO NOTHING`,
  [off.id],
);

// TWO SLOTS, AND BOTH ARE NECESSARY.
//
// A one-day error in the generation window is invisible to a WEEKLY slot most
// of the time: shift the window by a day and the same Saturdays still fall
// inside it. The first version of this check asserted one slot, and putting
// CURRENT_DATE back into the trigger left it green — a check that cannot fail
// is worse than no check, because it reads as coverage.
//
// These two straddle the boundary from both sides. A slot on the studio's own
// weekday first occurs a week out (the window opens tomorrow); a slot on
// tomorrow's weekday first occurs tomorrow. Whichever direction the server's
// clock is wrong in, one of the two moves.
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

// ── WHY `starts_at` IS TEXT AND NOT `TIME` ───────────────────
//
// It looks like a shortcut and is not. A zero-padded 24-hour `HH:MM` string
// sorts and compares lexicographically in exactly the order the clock does —
// but ONLY while every value has that shape, which is what the CHECK
// constraint on the column buys. Drop the constraint and "9:30" sorts after
// "19:00", silently, in every timetable in the app.
//
// So the constraint is load-bearing and these assertions guard it. What TEXT
// does not give is arithmetic (`starts_at + duration`); nothing needs it
// today, and the day something does is the day this becomes a real `TIME`
// column — which needs a cast in vex field selection first.
const times = await runtime.db.query<{ a: string }>(
  `SELECT starts_at a FROM class_sessions ORDER BY starts_at ASC`,
);
const listed = times.rows.map((r) => r.a);
ok('there are times to compare', listed.length > 5, `${listed.length} sessions`);

// The claim, stated as the thing that could break: text order IS clock order.
const asMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const byClock = [...listed].map(asMinutes);
ok('...and text order is clock order', byClock.every((m, i) => i === 0 || m >= (byClock[i - 1] ?? 0)), 'zero-padded HH:MM sorts as TIME does');

// The constraint that makes it true. Without it a single "9:30" inverts the
// whole ordering, so this asserts the guard rather than the good luck.
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
