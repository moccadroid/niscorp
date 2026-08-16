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
ok('twenty-six people, two automations and two children', (await count('SELECT count(*) n FROM people')) === 28, 'members, staff, prospects, outsiders, robots, and the two with no way in');
// COUNT(DISTINCT email) skips NULLs, which is the assertion rather than an
// accident of it: the two children carry no address, so 26 distinct addresses
// across 28 people is exactly "everybody who can sign in has their own way in".
ok('every email unique', (await count('SELECT count(DISTINCT email) n FROM people')) === 26);
ok(
  '...and the two with none are NULL rather than empty',
  (await count("SELECT count(*) n FROM people WHERE email IS NULL")) === 2 && (await count("SELECT count(*) n FROM people WHERE email = ''")) === 0,
  'two empty strings would collide under UNIQUE; two NULLs do not — see db/schema/people.ts',
);

// The anchor: one row per human a studio knows, and NO category on any of them.
ok('twenty-four anchor rows', (await count('SELECT count(*) n FROM studio_people')) === 24, 'the children are on the roll like anybody else');
ok(
  'one parent, two children, one studio',
  (await count('SELECT count(*) n FROM guardianships')) === 2 && (await count("SELECT count(*) n FROM guardianships WHERE guardian_person_id = 'p_ava'")) === 2,
  'the shape a scalar household id could not express',
);
ok(
  '...and the anchor stores no category',
  (await count("SELECT count(*) n FROM information_schema.columns WHERE table_name = 'studio_people' AND column_name IN ('status','kind','role')")) === 0,
  'what a person IS derives from what they hold — standing.ts',
);
ok('...one person is known to both studios', (await count('SELECT count(*) n FROM (SELECT person_id FROM studio_people GROUP BY person_id HAVING count(DISTINCT studio_id) > 1) x')) === 1, 'the physio both gyms refer to');
ok('...and no automation is on a roll', (await count("SELECT count(*) n FROM studio_people sp JOIN staff s ON s.person_id = sp.person_id AND s.role = 'automation'")) === 0);

ok('four contact tags', (await count('SELECT count(*) n FROM connections')) === 4);
ok('...every tagged person is anchored', (await count('SELECT count(*) n FROM connections c WHERE NOT EXISTS (SELECT 1 FROM studio_people sp WHERE sp.person_id = c.person_id AND sp.studio_id = c.studio_id)')) === 0, 'a tag hangs off the anchor, never floats');
ok('five staff and two automations', (await count('SELECT count(*) n FROM staff')) === 7);
ok('one automation per studio', (await count("SELECT count(DISTINCT studio_id) n FROM staff WHERE role = 'automation'")) === 2);

ok(
  'two people are staff AND train at their studio',
  (await count('SELECT count(*) n FROM staff s JOIN studio_people sp ON sp.person_id = s.person_id AND sp.studio_id = s.studio_id')) === 2,
  'holding two relationships at once is the point of the model',
);

// ── what is on sale ──
ok('thirteen offerings', (await count('SELECT count(*) n FROM offerings')) === 13, 'six plans, three passes, two one-offs, two course blocks — one catalogue, four kinds');
// SOLD ONCE AND GRANTING NOTHING — seeded rather than only tested, because the
// screens that derive what somebody IS read this dataset, and a joining fee
// must not make anybody a pass holder.
ok(
  '...two of them sold once and granting nothing',
  (await count("SELECT count(*) n FROM offerings WHERE kind = 'one_off'")) === 2,
  'the shape that had no home until it had its own kind',
);
// ONE AT EACH STUDIO, and the first one matters more than the second: a
// mechanism seeded only at Northrock is one nobody meets, because Lumen is the
// studio every screenshot and every first signup lands in.
ok(
  '...one at each studio, charged because a plan names it',
  (await count('SELECT count(*) n FROM offerings WHERE joining_fee_id IS NOT NULL')) === 2,
  'a joining fee nothing points at is a price list entry, not a charge',
);
// A PERIOD THAT IS NOT ONE MONTH, in the dataset rather than only in a test.
// Every revenue figure in this app sums `monthly_cents`, and a seed where every
// plan bills monthly makes an arithmetic that ignores the period look correct.
ok(
  '...one of them billed quarterly',
  (await count("SELECT count(*) n FROM offerings WHERE interval = 'month' AND interval_count = 3")) === 1,
  'the shape the price list could not express until the interval became a pair',
);
ok('...three of them passes', (await count("SELECT count(*) n FROM offerings WHERE kind = 'pass'")) === 3);
ok('...including a drop-in at each studio', (await count("SELECT count(DISTINCT studio_id) n FROM offerings WHERE kind = 'pass' AND credits = 1")) === 2, 'a drop-in is a one-credit pass');
ok('...and a pass cannot be creditless', (await count("SELECT count(*) n FROM offerings WHERE kind = 'pass' AND credits IS NULL")) === 0, 'a CHECK, not a convention');

// ── entitlements ──
ok('eleven subscriptions', (await count('SELECT count(*) n FROM subscriptions')) === 11, 'Hana has none — her trial closed and nobody asked her yet');
ok('...every state represented', (await count('SELECT count(DISTINCT status) n FROM subscriptions')) === 3, 'active, paused, cancelled');
ok('...and one that ENDED through the notice ledger', (await count("SELECT count(*) n FROM subscriptions WHERE status = 'cancelled' AND ends_on IS NOT NULL")) === 1, 'Luca — his leaving date is arithmetic, not a hand-typed column');
ok('one pass sold', (await count('SELECT count(*) n FROM passes')) === 1);
ok('...a single-class drop-in, unspent', (await count('SELECT count(*) n FROM passes WHERE credits_total = 1 AND credits_used = 0')) === 1, 'Ida — the person the old schema could not represent');

// A live trial and a closed one, both DERIVED from a date nothing updates.
const running = await count('SELECT count(*) n FROM studio_people WHERE trial_ends_on >= studio_today(studio_id)');
const over = await count('SELECT count(*) n FROM studio_people WHERE trial_ends_on < studio_today(studio_id)');
ok('trials still running exist to test with', running >= 2, `${running} live — Lena beside a subscription, Tom with nothing`);
ok('...and ones that ran out, without anything having run', over >= 2, `${over} past their window — derived, not written`);

// Tom Vogel: the canonical self-service subject, standing at the plan-choice
// cliff — an anchor, a live trial, and NOTHING else.
// docs/plans/lyra-model-overhaul.md Part 8.
ok(
  'Tom Vogel stands at the cliff',
  (await count(`SELECT count(*) n FROM studio_people sp WHERE sp.person_id = 'p_tomv' AND sp.trial_ends_on >= studio_today(sp.studio_id)
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.person_id = sp.person_id)
      AND NOT EXISTS (SELECT 1 FROM passes p WHERE p.person_id = sp.person_id)
      AND NOT EXISTS (SELECT 1 FROM enrolments e WHERE e.person_id = sp.person_id)`)) === 1,
  'a live trial and no entitlement — the acceptance test walks from here',
);

// ── the schedule ──
ok('fourteen ongoing slots and two course slots', (await count('SELECT count(*) n FROM class_templates')) === 16);

// ── programs are a taxonomy; courses are dated ──
ok('a program carries no dates', (await count("SELECT count(*) n FROM information_schema.columns WHERE table_name = 'programs' AND column_name IN ('starts_on','ends_on')")) === 0, 'a stream runs indefinitely; that is what makes it a stream');
ok('...and no blurb smuggles a schedule in', (await count("SELECT count(*) n FROM programs WHERE blurb ~* '(six|four|eight) weeks|every term|saturday mornings'")) === 0, 'a blurb is prose for a human, never a fact the app needs');

ok('two courses, one per studio', (await count('SELECT count(*) n FROM courses')) === 2);
ok('...each with a start and an end', (await count('SELECT count(*) n FROM courses WHERE starts_on IS NOT NULL AND ends_on IS NOT NULL')) === 2);
// PRICED FROM THE CATALOGUE, not from a column of its own. A block used to
// carry price_cents, which made courses a second price list; the join is the
// claim that there is only one now.
ok(
  '...and a price to charge later, in the one catalogue',
  (await count("SELECT count(*) n FROM courses c JOIN offerings o ON o.id = c.offering_id WHERE o.kind = 'course' AND o.price_cents > 0")) === 2,
);

ok('a course slot is bounded', (await count('SELECT count(*) n FROM class_templates WHERE course_id IS NOT NULL AND starts_on IS NOT NULL AND ends_on IS NOT NULL')) === 2);
ok('...and an ordinary class is not', (await count('SELECT count(*) n FROM class_templates WHERE course_id IS NULL AND starts_on IS NULL')) === 14, 'both NULL is an ongoing class');
ok('...so no session lands outside its block', (await count('SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.ends_on IS NOT NULL AND (cs.held_on < ct.starts_on OR cs.held_on > ct.ends_on)')) === 0);
ok('...while the block does have classes', (await count("SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found'")) > 0);

ok('one enrolment is seeded', (await count('SELECT count(*) n FROM enrolments')) === 1);
ok('...and the counter cache followed', (await count("SELECT enrolled_count n FROM courses WHERE id = 'co_lumen_found'")) === 1);
ok('...fanned out into real bookings', (await count("SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND b.person_id = 'p_jonas'")) > 0, 'the desk’s roster has no idea a course exists');
ok('sessions were generated', (await count('SELECT count(*) n FROM class_sessions')) > 140);
ok(
  'every session matches its template weekday',
  (await count('SELECT count(*) n FROM class_sessions s JOIN class_templates t ON t.id = s.template_id WHERE EXTRACT(DOW FROM s.held_on) <> t.weekday')) === 0,
);
ok('both studios have sessions this week', (await count('SELECT count(DISTINCT studio_id) n FROM class_sessions WHERE held_on BETWEEN studio_today(studio_id) AND studio_today(studio_id) + 6')) === 2);
ok('north rock runs more classes than lumen', (await count(`SELECT count(*) n FROM class_sessions WHERE studio_id='${NORTHROCK}'`)) > (await count(`SELECT count(*) n FROM class_sessions WHERE studio_id='${LUMEN}'`)));
ok('one class is cancelled', (await count("SELECT count(*) n FROM class_sessions WHERE status='cancelled'")) >= 1);

ok(
  'hour_key agrees with starts_at',
  (await count("SELECT count(*) n FROM class_sessions WHERE hour_key <> split_part(starts_at, ':', 1)::int")) === 0,
);
ok('week_key is populated', (await count("SELECT count(*) n FROM class_sessions WHERE week_key = ''")) === 0);

// ── bookings and attendance ──
ok('bookings were generated', (await count('SELECT count(*) n FROM bookings')) > 180);
ok('only live subscribers were generated bookings', (await count("SELECT count(*) n FROM bookings b WHERE b.id LIKE 'bk_%' AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.person_id = b.person_id AND s.studio_id = b.studio_id AND s.status = 'active')")) === 0, 'the entitlement, not a category, is what put them in class');
ok('no booking crosses a studio', (await count('SELECT count(*) n FROM bookings b JOIN class_sessions s ON s.id = b.session_id WHERE s.studio_id <> b.studio_id')) === 0);
ok('check-ins were generated', (await count('SELECT count(*) n FROM check_ins')) > 120);
ok('nobody checked in to a future class', (await count('SELECT count(*) n FROM check_ins WHERE held_on > studio_today(studio_id)')) === 0);

const booked = await count('SELECT count(*) n FROM bookings b JOIN class_sessions s ON s.id=b.session_id WHERE s.held_on < studio_today(s.studio_id)');
const attended = await count('SELECT count(*) n FROM check_ins WHERE session_id IS NOT NULL');
ok('past bookings include no-shows', attended < booked && attended > booked * 0.6, `${attended} of ${booked} attended`);

ok(
  'the attended flag agrees with the check-ins',
  (await count("SELECT count(*) n FROM bookings b WHERE b.attended <> EXISTS (SELECT 1 FROM check_ins c WHERE c.session_id = b.session_id AND c.person_id = b.person_id)")) === 0,
);
ok('...and some bookings are flagged attended', (await count('SELECT count(*) n FROM bookings WHERE attended')) > 100);

ok('one walk-in has no session', (await count('SELECT count(*) n FROM check_ins WHERE session_id IS NULL')) === 1);

// ── the relationship mirrors agree with the rows they mirror ──
//
// The same hygiene every counter cache here gets: recompute from the source
// tables and compare, so a trigger nobody fired (or a seed order nobody
// noticed) is a red line rather than a wrong badge on the roll.
ok(
  'the subscription mirrors agree',
  (await count(`SELECT count(*) n FROM studio_people sp WHERE
      sp.active_subscriptions <> (SELECT count(*) FROM subscriptions s WHERE s.studio_id = sp.studio_id AND s.person_id = sp.person_id AND s.status = 'active')
   OR sp.paused_subscriptions <> (SELECT count(*) FROM subscriptions s WHERE s.studio_id = sp.studio_id AND s.person_id = sp.person_id AND s.status = 'paused')
   OR sp.held_subscriptions   <> (SELECT count(*) FROM subscriptions s WHERE s.studio_id = sp.studio_id AND s.person_id = sp.person_id)`)) === 0,
  'recomputed from the table, zero drift',
);
ok(
  '...and the pass, course, staff and contact mirrors too',
  (await count(`SELECT count(*) n FROM studio_people sp WHERE
      sp.pass_live_until IS DISTINCT FROM (SELECT MAX(COALESCE(p.expires_on, DATE '9999-12-31')) FROM passes p WHERE p.studio_id = sp.studio_id AND p.person_id = sp.person_id AND p.status = 'active' AND p.credits_used < p.credits_total)
   OR sp.enrolled_until  IS DISTINCT FROM (SELECT MAX(c.ends_on) FROM enrolments e JOIN courses c ON c.id = e.course_id WHERE e.studio_id = sp.studio_id AND e.person_id = sp.person_id AND e.status = 'enrolled')
   OR sp.works_here <> EXISTS (SELECT 1 FROM staff st WHERE st.studio_id = sp.studio_id AND st.person_id = sp.person_id AND st.active)
   OR sp.deals_here <> EXISTS (SELECT 1 FROM connections c WHERE c.studio_id = sp.studio_id AND c.person_id = sp.person_id AND c.active)`)) === 0,
  'horizon dates compared at read, counts resynced at write — nothing stored that can rot',
);
ok('...with somebody on each side of every line', (await count('SELECT count(*) n FROM studio_people WHERE works_here')) === 2 && (await count('SELECT count(*) n FROM studio_people WHERE deals_here')) === 4 && (await count('SELECT count(*) n FROM studio_people WHERE pass_live_until IS NOT NULL')) === 1, 'the mirrors carry the seed’s own stories');

// ── the tenant boundary, in the data itself ──
ok('no subscription crosses studios through its offering', (await count('SELECT count(*) n FROM subscriptions sub JOIN offerings o ON o.id = sub.offering_id WHERE o.studio_id <> sub.studio_id')) === 0);
ok('no pass crosses studios through its offering', (await count('SELECT count(*) n FROM passes p JOIN offerings o ON o.id = p.offering_id WHERE o.studio_id <> p.studio_id')) === 0);

console.log(failed === 0 ? `\n\x1b[32mOK — the dataset is as the suite assumes.\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
