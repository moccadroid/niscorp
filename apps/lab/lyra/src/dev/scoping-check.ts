// Scoping check — one table, two rungs, different reach.
//
// WHAT THIS REPLACES. A charter verb is TABLE-level and a behavior used to be a
// property of the table, so every rung holding any grant on `bookings` got the
// same reach: filtered to the studio, and no further. "The desk reads every
// booking; a member reads their own" could not be said.
//
// The workaround was a SECOND TABLE — `member_bookings` — with a person-filtered
// rule attached, and a trigger keeping the two level. That is one fact in two
// places, and it drifted: the projection direction did not exist at all until it
// was found, so a member with twenty-six bookings was shown "Nothing booked
// yet" while the desk saw every one of them.
//
// Now the RUNG names its reach and the TABLE says what that reach means for it.
// The assertions below are the ones that make the second table unnecessary.
//
// Run: pnpm --filter lyra exec tsx src/dev/scoping-check.ts
import { CAST } from '@lyra/db/seed';
import { resolvePolicy } from '@niscorp/moss';
import { app, asPrincipal, ok, report, runtime } from './world';

const count = async (sql: string): Promise<number> => Number((await runtime.db.query<{ n: string }>(sql)).rows[0]?.n ?? -1);

// FROM TODAY FORWARD, because `me/bookings` is bounded that way — it is "what
// you have booked", not "everything you ever booked", and it used to open on a
// class in June with a Cancel button beside it. A count without the same bound
// measures a different question and the assertion below would be comparing two.
const UPCOMING = "AND session_id IN (SELECT id FROM class_sessions WHERE held_on >= studio_today('st_lumen'))";
const mine = await count(`SELECT count(*) n FROM bookings WHERE membership_id = 'mb_ava' AND status = 'booked' ${UPCOMING}`);
const studio = await count(`SELECT count(*) n FROM bookings WHERE studio_id = 'st_lumen' AND status = 'booked' ${UPCOMING}`);
ok('the seed has both quantities to tell apart', mine > 0 && studio > mine, `${mine} of Ava's against ${studio} at the studio`);

// ── THE SAME FINGERPRINT, FROM TWO RUNGS ─────────────────────
//
// Not two reads, not two tables, not two endpoints. ONE authored query,
// replayed by two principals, returning different rows because the engine ANDed
// a different filter onto it. Neither the request nor the query can see the
// difference, let alone choose it.
const asMember = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const asDesk = await asPrincipal(CAST.lumen.desk, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });

const memberRows = Array.isArray(asMember) ? asMember.length : -1;
const deskRows = Array.isArray(asDesk) ? asDesk.length : -1;

ok('a member reads their own bookings from the REAL table', memberRows === mine, `${memberRows} rows against ${mine} of theirs`);

// A DESK REPLAYING IT GETS NOTHING, and that is the stronger property.
//
// This assertion used to read "reads the studio", and it was the centrepiece:
// one fingerprint, two reaches, the query unable to tell. It changed when the
// member entries started pinning themselves on `membershipId` in the query —
// which they had to, because a principal holding two roles gets the widest
// reach either grants, and a teacher who trains here was seeing all 93.
//
// So this fingerprint no longer demonstrates reach. It demonstrates something
// better: a member surface replayed by staff returns nothing at all, because
// the desk has no membership to match. Reach is still doing its work
// underneath — asserted directly below, where it cannot be confused with the
// query's own filter.
ok('...and a desk replaying the identical fingerprint gets nothing', deskRows === 0, `${deskRows} rows — no membership, no match`);

// EVERY row is theirs — a count alone would pass if the filter matched the
// wrong column and happened to return the right number.
const ids = new Set((Array.isArray(asMember) ? asMember : []).map((r) => String((r as { booking_id?: unknown }).booking_id ?? '')));
const foreignRows = await count(
  `SELECT count(*) n FROM bookings WHERE membership_id <> 'mb_ava' AND id IN (${[...ids].map((i) => `'${i}'`).join(',') || `''`})`,
);
ok('...and not one of those rows belongs to anybody else', foreignRows === 0, `${foreignRows} foreign row(s) in a ${memberRows}-row answer`);

// ── THE TENANT RULE STILL STACKS ─────────────────────────────
const foreign = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const northRock = Array.isArray(foreign) ? foreign.length : -1;
// NOT a count comparison — North Rock's member happens to have the same number
// of bookings as Ava, so "the counts differ" would have been a coincidence
// dressed as an assertion. Whose rows they are is the claim.
ok('another studio’s member reads their own, at their own studio', northRock > 0, `${northRock} rows`);
const leaked = await count(
  `SELECT count(*) n FROM bookings WHERE studio_id = 'st_lumen' AND id IN (${(Array.isArray(foreign) ? foreign : []).map((r) => `'${String((r as { booking_id?: unknown }).booking_id ?? '')}'`).join(',') || `''`})`,
);
ok('...with no Lumen row among them', leaked === 0, 'the personal rule ANDs onto the tenant rule, it does not replace it');

// ── REACH ITSELF, READ OFF THE COMPILED POLICY ───────────────
//
// Directly, because the fingerprints above can no longer show it. The same
// grant on two rungs compiles to a different number of row filters: the member
// carries the tenant rule plus their own, the desk carries the tenant rule
// alone. This is what the query cannot see and cannot opt out of.
// The universe the charter selects from. Named here rather than derived, so the
// assertion says which grant it is talking about.
const BOOKING_GRANTS = ['bookings.read', 'bookings.write.insert', 'bookings.write.update'];

const rulesFor = (personId: string, phase: 'read'): number => {
  const entity = resolvePolicy(app, BOOKING_GRANTS, personId).entities['bookings'];
  return entity === undefined || 'public' in entity || 'deny' in entity ? -1 : (entity[phase] ?? []).length;
};

const memberRules = rulesFor('p_ava', 'read');
const deskRules = rulesFor('p_ines', 'read');
ok("a member's policy filters bookings by more than the tenant", memberRules > deskRules, `${memberRules} rule(s) against the desk's ${deskRules}`);
ok('...and the desk keeps the roster it exists to read', deskRules >= 1, `${deskRules} rule(s) — the tenant boundary, and nothing narrower`);

// ── THE RUNG ABOVE DOES NOT INHERIT THE REACH ────────────────
//
// The trap this design had to avoid: every charter section accumulates upward,
// so a desk holds everything a member holds. If reach accumulated the same way,
// a desk would inherit "only my own rows" and the roster it exists to read would
// filter to whoever was operating it. The desk assertion above is that half.
//
// ── AND A PROFILE IS A FLOOR, NOT A CEILING ──────────────────
//
// Tobias teaches here and trains here, so he holds BOTH roles. One policy is
// compiled per role and merged, and the merge takes the WIDEST reach either
// grants — which is right for the roster he is paid to read, and dangerous for
// the screen that says "what you have booked".
//
// This assertion used to read "an instructor who also trains reads the whole
// studio", and it was GREEN while his own member screen listed all 93 bookings
// at the studio. A check can bless a bug by asserting the mechanism instead of
// the consequence. So both halves are asserted now: the reach is wide, AND the
// member fingerprint is narrow anyway, because it pins itself in the query.
const busiest = await runtime.db.query<{ session_id: string; n: string }>(
  "SELECT session_id, count(*) AS n FROM bookings WHERE studio_id = 'st_lumen' AND status = 'booked' GROUP BY session_id ORDER BY n DESC LIMIT 1",
);
const sessionId = String(busiest.rows[0]?.session_id ?? '');
const teacherRoster = await asPrincipal(CAST.lumen.instructor, '/api/schedule/vex', { fingerprint: 'roster/forSession', context: { sessionId } });
ok(
  'an instructor who also trains still reads the studio where the job needs it',
  Array.isArray(teacherRoster) && teacherRoster.length === Number(busiest.rows[0]?.n ?? -1),
  `${Array.isArray(teacherRoster) ? teacherRoster.length : -1} on the roster against ${busiest.rows[0]?.n} booked — the member role did not narrow his teaching`,
);

const teacherOwn = await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const teacherRows = Array.isArray(teacherOwn) ? teacherOwn.length : -1;
ok('...but HIS screen shows his own bookings', teacherRows > 0 && teacherRows < studio, `${teacherRows} against the studio's ${studio}`);

// Not a count coincidence: every row carries his membership.
const own = await runtime.db.query<{ n: string }>(
  `SELECT count(*) AS n FROM bookings b
     JOIN memberships m ON m.id = b.membership_id
     JOIN class_sessions cs ON cs.id = b.session_id
    WHERE m.person_id = 'p_tobias' AND b.status <> 'cancelled'
      AND cs.held_on >= studio_today('st_lumen')`,
);
ok('...and that is exactly how many he has', teacherRows === Number(own.rows[0]?.n ?? -1), `${teacherRows} against ${own.rows[0]?.n} in the table`);

report('one table, two reaches — and a member surface that pins itself as well, because holding two roles widens the first.');
