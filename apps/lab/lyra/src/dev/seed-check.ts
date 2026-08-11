// Seed check — the dataset is what the rest of the suite assumes.
//
// Every other check reads these rows as ground truth, so a silent change here
// would make their failures meaningless. It also pins the two facts the data
// model exists to express: a walk-in check-in with no session, and a person who
// is staff and a member at the same studio.
//
// Run: pnpm --filter lyra exec tsx src/dev/seed-check.ts
import { devRuntime } from '@lyra/server/runtime';
import { LUMEN, NORTHROCK } from '@lyra/db/seed';

let failed = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

const runtime = await devRuntime();
const one = async (sql: string): Promise<Record<string, unknown>> => {
  const result = await runtime.db.query<Record<string, unknown>>(sql);
  return result.rows[0] ?? {};
};
const count = async (sql: string): Promise<number> => Number((await one(sql))['n'] ?? -1);

// ── the studios ──
ok('two studios', (await count('SELECT count(*) n FROM studios')) === 2);
ok('both kinds differ', (await count('SELECT count(DISTINCT kind) n FROM studios')) === 2);

// ── people and their relationships ──
// EVERYBODY IS A PERSON. Sixteen members and staff, five prospects, three
// outsiders the studios only deal with, plus one automation principal per
// studio. The prospects used to be rows in a `leads` table — a second class of
// human who could not become the first without being retyped — and the
// outsiders had nowhere to exist at all. The robots are people for the same
// reason: the directory is keyed on people, and an automation resolving
// through some other path would be an automation the charter does not govern.
ok('twenty-four people and two automations', (await count('SELECT count(*) n FROM people')) === 26, 'members, staff, prospects, outsiders, robots');
ok('every email unique', (await count('SELECT count(DISTINCT email) n FROM people')) === 26);

// Thirteen who train (or did) plus five enquiries — the SAME table, because an
// enquiry is a membership at stage zero. Four are still asking; Rafi's ended.
ok('eighteen memberships', (await count('SELECT count(*) n FROM memberships')) === 18);
ok('...four of them still asking', (await count("SELECT count(*) n FROM memberships WHERE status = 'enquired'")) === 4, 'an enquiry is this row one status earlier');
ok('...and none of them on the roll', (await count("SELECT count(*) n FROM memberships WHERE status IN ('active','trialling')")) === 10, 'the roll reads named statuses, so a prospect cannot leak onto it');

// The third verb. Gretel is the case worth having: one human, known to both
// studios, which the old shape could not represent at all.
ok('four connections', (await count('SELECT count(*) n FROM connections')) === 4);
ok('...and one person is known to both studios', (await count('SELECT count(*) n FROM (SELECT person_id FROM connections GROUP BY person_id HAVING count(DISTINCT studio_id) > 1) x')) === 1, 'the physio both gyms refer to');
ok('...and no automation holds one', (await count("SELECT count(*) n FROM memberships m JOIN staff s ON s.person_id = m.person_id WHERE s.role = 'automation'")) === 0, 'they never appear on a roll');
ok('five staff and two automations', (await count('SELECT count(*) n FROM staff')) === 7);
ok('one automation per studio', (await count("SELECT count(DISTINCT studio_id) n FROM staff WHERE role = 'automation'")) === 2);

// Every lifecycle state appears — a screen that has only seen `active` is a
// screen nobody tested.
const states = await runtime.db.query<{ status: string }>('SELECT DISTINCT status FROM memberships ORDER BY status');
ok(
  'every membership status is represented',
  ['active', 'cancelled', 'lapsed', 'paused', 'trialling'].every((s) => states.rows.some((r) => r.status === s)),
  states.rows.map((r) => r.status).join(', '),
);

// The person/membership split earns its keep: staff who also train.
ok(
  'two people are staff AND members at their studio',
  (await count('SELECT count(*) n FROM staff s JOIN memberships m ON m.person_id = s.person_id AND m.studio_id = s.studio_id')) === 2,
);

// ── the schedule ──
ok('fourteen ongoing slots and two course slots', (await count('SELECT count(*) n FROM class_templates')) === 16);

// ── programs are a taxonomy; courses are dated ──
//
// The distinction this schema got wrong first. A program with no dates that
// claimed "six weeks, every term" in its blurb was prose standing in for
// structure — unreadable by the app, unbookable by a member, and untrue the
// moment somebody moved the dates.
ok('a program carries no dates', (await count("SELECT count(*) n FROM information_schema.columns WHERE table_name = 'programs' AND column_name IN ('starts_on','ends_on')")) === 0, 'a stream runs indefinitely; that is what makes it a stream');
ok('...and no blurb smuggles a schedule in', (await count("SELECT count(*) n FROM programs WHERE blurb ~* '(six|four|eight) weeks|every term|saturday mornings'")) === 0, 'a blurb is prose for a human, never a fact the app needs');

ok('two courses, one per studio', (await count('SELECT count(*) n FROM courses')) === 2);
ok('...each with a start and an end', (await count('SELECT count(*) n FROM courses WHERE starts_on IS NOT NULL AND ends_on IS NOT NULL')) === 2);
ok('...and a price to charge later', (await count('SELECT count(*) n FROM courses WHERE price_cents > 0')) === 2);

// BOUNDED RECURRENCE. One generator, one schedule concept — a course's weeks
// are a weekly rule that stops.
ok('a course slot is bounded', (await count('SELECT count(*) n FROM class_templates WHERE course_id IS NOT NULL AND starts_on IS NOT NULL AND ends_on IS NOT NULL')) === 2);
ok('...and an ordinary class is not', (await count('SELECT count(*) n FROM class_templates WHERE course_id IS NULL AND starts_on IS NULL')) === 14, 'both NULL is an ongoing class');
ok('...so no session lands outside its block', (await count('SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.ends_on IS NOT NULL AND (cs.held_on < ct.starts_on OR cs.held_on > ct.ends_on)')) === 0);
ok('...while the block does have classes', (await count("SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found'")) > 0);

// ONE ROW IN, A BLOCK OF BOOKINGS OUT.
ok('one enrolment is seeded', (await count('SELECT count(*) n FROM enrolments')) === 1);
ok('...and the counter cache followed', (await count("SELECT enrolled_count n FROM courses WHERE id = 'co_lumen_found'")) === 1);
ok('...fanned out into real bookings', (await count("SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND b.membership_id = 'mb_jonas'")) > 0, 'the desk’s roster has no idea a course exists');
ok('sessions were generated', (await count('SELECT count(*) n FROM class_sessions')) > 140);
ok(
  'every session matches its template weekday',
  (await count('SELECT count(*) n FROM class_sessions s JOIN class_templates t ON t.id = s.template_id WHERE EXTRACT(DOW FROM s.held_on) <> t.weekday')) === 0,
);
ok('both studios have sessions this week', (await count('SELECT count(DISTINCT studio_id) n FROM class_sessions WHERE held_on BETWEEN studio_today(studio_id) AND studio_today(studio_id) + 6')) === 2);
ok('north rock runs more classes than lumen', (await count(`SELECT count(*) n FROM class_sessions WHERE studio_id='${NORTHROCK}'`)) > (await count(`SELECT count(*) n FROM class_sessions WHERE studio_id='${LUMEN}'`)));
ok('one class is cancelled', (await count("SELECT count(*) n FROM class_sessions WHERE status='cancelled'")) >= 1);

// The denormalised buckets exist because vex has no date functions; if they
// stop matching the date they are worse than useless.
ok(
  'hour_key agrees with starts_at',
  (await count("SELECT count(*) n FROM class_sessions WHERE hour_key <> split_part(starts_at, ':', 1)::int")) === 0,
);
ok('week_key is populated', (await count("SELECT count(*) n FROM class_sessions WHERE week_key = ''")) === 0);

// ── bookings and attendance ──
ok('bookings were generated', (await count('SELECT count(*) n FROM bookings')) > 180);
ok('only active and trialling memberships booked', (await count("SELECT count(*) n FROM bookings b JOIN memberships m ON m.id = b.membership_id WHERE m.status NOT IN ('active','trialling')")) === 0);
ok('no booking crosses a studio', (await count('SELECT count(*) n FROM bookings b JOIN class_sessions s ON s.id = b.session_id WHERE s.studio_id <> b.studio_id')) === 0);
ok('check-ins were generated', (await count('SELECT count(*) n FROM check_ins')) > 120);
ok('nobody checked in to a future class', (await count('SELECT count(*) n FROM check_ins WHERE held_on > studio_today(studio_id)')) === 0);

// Attendance is short of bookings on purpose: no-shows are the signal a
// retention screen exists to find.
const booked = await count('SELECT count(*) n FROM bookings b JOIN class_sessions s ON s.id=b.session_id WHERE s.held_on < studio_today(s.studio_id)');
const attended = await count('SELECT count(*) n FROM check_ins WHERE session_id IS NOT NULL');
ok('past bookings include no-shows', attended < booked && attended > booked * 0.6, `${attended} of ${booked} attended`);

// The attendance counter cache agrees with the check-ins it caches. A booking
// flagged without a check_in (or the reverse) is the drift the maintenance
// contract exists to prevent, and it is invisible from any screen.
ok(
  'the attended flag agrees with the check-ins',
  (await count("SELECT count(*) n FROM bookings b WHERE b.attended <> EXISTS (SELECT 1 FROM check_ins c WHERE c.session_id = b.session_id AND c.membership_id = b.membership_id)")) === 0,
);
ok('...and some bookings are flagged attended', (await count('SELECT count(*) n FROM bookings WHERE attended')) > 100);

// The walk-in: attendance with no booking and no session.
ok('one walk-in has no session', (await count('SELECT count(*) n FROM check_ins WHERE session_id IS NULL')) === 1);

// ── the tenant boundary, in the data itself ──
ok('no person holds memberships at both studios', (await count('SELECT count(*) n FROM (SELECT person_id FROM memberships GROUP BY person_id HAVING count(DISTINCT studio_id) > 1) x')) === 0);
ok('no plan is offered across studios', (await count('SELECT count(*) n FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id WHERE p.studio_id <> sub.studio_id')) === 0);

console.log(failed === 0 ? `\n\x1b[32mOK — the dataset is as the suite assumes.\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
