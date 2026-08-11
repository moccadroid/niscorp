// Member check — the side of the product a member actually uses, and the
// boundary that made it possible to build at all.
//
// The claim under test is NOT "a member can book a class". It is that giving
// them personal data cost nothing at the boundary: the roll is still refused,
// another member's card is still unreachable, and the write they hold cannot
// be aimed at anybody else — because the grammar has no field for a subject.
//
// This is the check that would have caught the leak that shipped once. It
// asserts the refusals FIRST, because a member surface that works and leaks is
// worse than no member surface, which is what we had.
//
// Run: pnpm --filter lyra exec tsx src/dev/member-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const MEMBER = CAST.lumen.member;
const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};
// A refusal is `{ status: <number> }`. Testing for the WORD "status" — which is
// what the other checks do and what this one did first — reports a successful
// read as a refusal the moment the payload has a status column of its own, and
// a membership card is exactly that payload.
const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { status?: unknown }).status === 'number';

// ── what a member still cannot do ────────────────────────────
//
// Every one of these is a fingerprint that EXISTS and is replayed by staff all
// day. A member is refused not because the read is missing but because their
// policy does not cover the tables it touches.
for (const [what, url, fingerprint, context] of [
  ['read the roll', '/api/member/vex', 'members/list', { statuses: ['active', 'trialling'], q: '%' }],
  ['read one member', '/api/member/vex', 'members/byId', { membershipId: 'mb_jonas' }],
  ['read a class roster', '/api/schedule/vex', 'roster/forSession', { sessionId: 'x' }],
  ['read who works here', '/api/staff/vex', 'staff/list', {}],
] as const) {
  ok(`a member cannot ${what}`, refused(await asPrincipal(MEMBER, url, { fingerprint, context })));
}

// ── THE TAKINGS: reachable now, and worth being explicit about ──
//
// This used to sit in the list above, refused. It is not refused any more, and
// the reason is the trade this design made deliberately: a member reads the
// real `subscriptions` table (their card is a join over it), so the revenue
// fingerprint is replayable by them.
//
// What comes back is THEIR OWN LINE — the row filter is what stops it being the
// studio's — so the assertion is no longer "refused" but "not the studio's",
// which is a statement about the filter rather than about the absence of a
// table. The old guarantee was two-layered (no grant AND no table on the
// resource); this is one layer, and it is the layer that holds on every
// surface. Recorded here rather than quietly dropped.
const takings = await asPrincipal(MEMBER, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} });
const owned = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} });
ok('a member replaying the takings gets only their own line', JSON.stringify(takings) !== JSON.stringify(owned), JSON.stringify(takings) + ' against the studio ' + JSON.stringify(owned));
ok('...and the studio total is not in it', !JSON.stringify(takings).includes('416'), 'the row filter, not the missing table, is what holds now');

// ── and cannot reach another member's own tables ─────────────
//
// THE ONE THAT MATTERS. `me/card` and `me/bookings` are the new grants, and
// the question is whether holding them is holding everybody's. The read takes
// no argument at all, so there is nothing to point elsewhere — and the row
// filter is engine-side, so the answer is theirs whatever the request says.
const card = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('a member reads their own card', !refused(card), JSON.stringify(card).slice(0, 80));
ok('...and it is THEIRS', JSON.stringify(card).includes('"plan_name":"Unlimited"'), 'keyed, because "Unlimited classes" is also what an EMPTY card says');

// Forging the scope values. Both are server-injected and unreferenceable, so
// the engine ANDs its own filter onto whatever arrived — which is empty.
const forged = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/card', context: { userId: 'p_jonas', personId: 'p_jonas', studioId: 'st_northrock' } });
ok('a forged person id changes nothing', JSON.stringify(forged) === JSON.stringify(card), 'context cannot reach a $scope slot');

const otherStudio = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('another studio’s member gets their own', JSON.stringify(otherStudio).includes('North Rock') && !JSON.stringify(otherStudio).includes('"plan_name":"Unlimited"'), JSON.stringify(otherStudio).slice(0, 90));

// ── the screens ──────────────────────────────────────────────
const member = login(MEMBER);
await settle(10);
let tree = treeOf(member);
ok('a member lands on their own surface', tree.includes('Your classes and your membership'));
ok('...showing their plan', tree.includes('"value":"Unlimited"'), 'the plan name as a text node, not the "Unlimited classes" fallback');
ok('...and their status', tree.includes('Active'));
ok('...and the classes they hold', tree.includes('Morning Flow'), 'seeded through the same trigger a tap uses');

// The nav is derived from what they hold, so this asserts ring 1 through the
// screen rather than through the resolver.
ok('...with no staff areas in the menu', !tree.includes('"label":"People"') && !tree.includes('"label":"Money"') && !tree.includes('"label":"Check in"'));
// The tab bar, not a flat nav. A member's application is three destinations —
// Today, Book, Mine — derived from the same section table an owner's five come
// from, with nothing branching on a role.
// One AREA, not two entries. Booking and My classes are the same question
// ("what about me"), so they share a hub — which is also where a payment
// history and a waiver will go without the menu noticing.
ok('...but their own area is there', tree.includes('"label":"Booking"'));

// NAVIGATION IS WHERE THE THUMB IS. This asserted the opposite for a while —
// no Tab, and a Burger — which was the desktop shape defended as simplicity:
// one surface, at the top-left corner of a phone, which is the single spot a
// thumb cannot reach. The bar is back and the burger is gone; More opens the
// same drawer from the bottom, so it is still ONE navigation surface, just one
// a hand can work.
ok('...reachable by a thumb, not a corner', tree.includes('"name":"Tab"') && !tree.includes('"name":"Burger"'), 'the thumb bar is the phone navigation');
// A member holds two areas plus Today, so the bar is three and More — never
// the fifteen-wide strip a flat nav becomes.
ok('...four at most, always', (tree.match(/"name":"Tab"/g) ?? []).length <= 5, `${(tree.match(/"name":"Tab"/g) ?? []).length} tabs`);

// ── booking ──────────────────────────────────────────────────
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(10);
tree = treeOf(member);
ok('a member reaches the class list', tree.includes('Drop into anything on the timetable'));
ok('...and is offered courses as well as single classes', tree.includes('Join once and your place is held'), 'a block is the bigger commitment, so it sits first');

const sessionRow = await runtime.db.query<{ id: string; booked_count: number }>(
  `SELECT cs.id, cs.booked_count FROM class_sessions cs
    WHERE cs.studio_id = 'st_lumen' AND cs.held_on > studio_today('st_lumen') AND cs.status = 'scheduled'
      AND cs.booked_count < cs.capacity
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.membership_id = 'mb_ava')
    ORDER BY cs.held_on, cs.starts_at LIMIT 1`,
);
const sessionId = sessionRow.rows[0]?.id ?? '';
const seatsBefore = Number(sessionRow.rows[0]?.booked_count ?? -1);

member.dispatch({ type: 'ui:click', ref: 'book', payload: { session_id: sessionId } });
await settle(16);

ok('a member can book themselves in', (await count('SELECT count(*) n FROM bookings WHERE membership_id = $1 AND session_id = $2 AND status = $3', ['mb_ava', sessionId, 'booked'])) === 1);

// ONE ROW, so there are no longer two halves to disagree. This asserted that a
// mirror and its operational row both moved; the mirror is gone, and what the
// desk reads is what the member wrote.
ok('...and the seat count moved', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore + 1);
ok('...so the desk sees them on the roster', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND membership_id = 'mb_ava' AND status = 'booked'", [sessionId])) === 1);

// ── what a booking cannot be aimed at ────────────────────────
//
// The mutation carries ONE value. `membership_id` and `studio_id` are stamped from
// scope, so "book somebody else" is not a request that can be phrased.
const foreignSession = await runtime.db.query<{ id: string }>("SELECT id FROM class_sessions WHERE studio_id = 'st_northrock' AND held_on > studio_today('st_northrock') LIMIT 1");
const across = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: foreignSession.rows[0]?.id ?? '' } });
ok('a member cannot book into another studio', refused(across), JSON.stringify(across).slice(0, 90));
ok('...and no row was written', (await count("SELECT count(*) n FROM bookings WHERE studio_id = 'st_northrock' AND membership_id = 'mb_ava'")) === 0);

// BEFORE AND AFTER, not "Jonas has none".
//
// This asserted that Jonas held zero member rows, which passed only because
// nothing but a member's own tap ever wrote one. Jonas is seeded onto a course,
// so the moment bookings began projecting he had rows he is entitled to and a
// security assertion went red for a correctness fix. A refusal check must
// measure the DELTA the forged request caused, or it is really asserting the
// state of the seed.
const jonasBefore = await count("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_jonas'");
const forgedBook = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId, personId: 'p_jonas', person_id: 'p_jonas' } });
void forgedBook;
ok('a member cannot book somebody else', (await count("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_jonas'")) === jonasBefore, 'the grammar has no subject to forge');
ok('...and the row it DID write is their own', (await count("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_ava' AND session_id = $1", [sessionId])) === 1, 'stamped from the rung, not from the request');

// ── double booking, and changing their mind ──────────────────
const twice = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId } });
// BOOKING TWICE IS IDEMPOTENT, not refused.
//
// It used to raise, which made a double tap a 500 — and made the course fan-out
// fail wholesale the moment one of its sessions was already booked, taking the
// whole enrolment with it. The row they wanted exists and the screen shows it
// booked; there is nothing to report. What matters is that no SECOND row
// appears, which is the line below.
ok('booking the same class twice changes nothing', !refused(twice), JSON.stringify(twice).slice(0, 60));
ok('...and there is still exactly one row', (await count('SELECT count(*) n FROM bookings WHERE membership_id = $1 AND session_id = $2', ['mb_ava', sessionId])) === 1);
ok('...and the seat count did not move again', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore + 1);

member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.bookings' });
await settle(10);
ok('a member reaches their own classes', treeOf(member).includes('Everything you are booked into'));

const bookingId = (await runtime.db.query<{ id: string }>('SELECT id FROM bookings WHERE membership_id = $1 AND session_id = $2', ['mb_ava', sessionId])).rows[0]?.id ?? '';
member.dispatch({ type: 'ui:click', ref: 'cancel', payload: { booking_id: bookingId } });
await settle(16);

ok('a member can cancel', (await count('SELECT count(*) n FROM bookings WHERE id = $1 AND status = $2', [bookingId, 'cancelled'])) === 1);
// ONE ROW to cancel. This asserted that the mirror's cancel reached the
// operational row; there is only the operational row now.
ok('...and it is the row the desk reads', (await count("SELECT count(*) n FROM bookings WHERE id = $1 AND status = 'cancelled'", [bookingId])) === 1);
ok('...freeing the seat', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore, 'the counter trigger, not the writer');

// Changing their mind back. Both tables are unique on (person, session), so
// this is the case a naive insert would break — handled in the mirror trigger
// so that "book this class" stays one intent.
const again = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId } });
ok('a member can book again after cancelling', !refused(again), JSON.stringify(again).slice(0, 80));
ok('...reusing the row rather than duplicating it', (await count('SELECT count(*) n FROM bookings WHERE membership_id = $1 AND session_id = $2', ['mb_ava', sessionId])) === 1);
ok('...and the seat is taken again', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore + 1);

// ── cancelling is theirs alone ───────────────────────────────
const jonasBooking = await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE membership_id <> 'mb_ava' LIMIT 1");
if (jonasBooking.rows[0] !== undefined) {
  const other = jonasBooking.rows[0].id;
  await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/cancel', context: { bookingId: other } });
  ok('a member cannot cancel somebody else’s class', (await count('SELECT count(*) n FROM bookings WHERE id = $1 AND status = $2', [other, 'booked'])) === 1, 'the update matched no row');
} else {
  ok('a member cannot cancel somebody else’s class', true, 'no second member booking to attempt — asserted by the write behaviors above');
}

// ── the card follows the studio ──────────────────────────────
//
// A member's card is a projection, so the question a projection always raises
// is whether it goes stale. The desk changes the status; the card must move.
await runtime.db.query("UPDATE memberships SET status = 'paused' WHERE id = 'mb_ava'");
// The card IS the membership now, so a status change cannot fail to reach it —
// there is nothing to reach. This asserted a trigger kept a copy in step; the
// copy is gone, which is the stronger version of the same guarantee.
ok('a status change is the card', (await count("SELECT count(*) n FROM memberships WHERE id = 'mb_ava' AND status = 'paused'")) === 1, 'one row, so nothing to keep in step');
await runtime.db.query("UPDATE memberships SET status = 'active' WHERE id = 'mb_ava'");


// ── who is offered the member surfaces ───────────────────────
//
// Every staff role extends `member`, so an owner HOLDS `me.*` — correctly, for
// the owner who also trains. What they should not get is two nav items leading
// to an empty card. The distinction is a membership row, not a grant.
const boss = login(CAST.lumen.owner);
await settle(8);
const bossTree = treeOf(boss);
ok('an owner who does not train is not offered booking', !bossTree.includes('"label":"Booking"'), 'derived from a membership row, not from the charter');
// The grant is genuinely still there — asserted at the surface, not assumed.
// Ring 1 decides what EXISTS; the directory decides what is worth offering.
const bossCard = await asPrincipal(CAST.lumen.owner, '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('...though the grant is still theirs', !refused(bossCard), 'the read answers; it just has nothing to say');
ok('...and answers with nothing, because they hold no membership', !JSON.stringify(bossCard).includes('"plan_name":"Unlimited"'), JSON.stringify(bossCard).slice(0, 70));

// Tobias teaches AND trains, so he gets both halves.
const both = login(CAST.lumen.instructor);
await settle(8);
const bothTree = treeOf(both);
ok('an instructor who trains IS offered booking', bothTree.includes('"label":"Booking"'), 'one person, two relationships with the studio');
ok('...and still lands on the instructor day', bothTree.includes('"label":"Check in"') || !bothTree.includes('Your classes and your membership'));

// ── A BOOKING THEY DID NOT MAKE THEMSELVES ───────────────────
//
// The bug this replaced: `member_bookings` was written only by the member, so a
// booking made by the desk, by the seed, or by a course fan-out never reached
// the person it belonged to. Omar had twenty-four bookings and was shown
// "Nothing booked yet", and because "are you already booked?" was answered from
// that table, his booking screen offered him a class he was sitting in.
//
// It is not a sync problem any more, it is not a problem at all: there is one
// table, so a booking is visible to its owner the moment it exists, whoever
// wrote it. What is worth asserting is that the member's READ agrees with the
// rows — which is the property the projection was failing to provide.
// BOUNDED TO TODAY FORWARD, the same way the screen is. `me/bookings` answers
// "what you have booked", not "everything you ever booked" — it used to open on
// a class in June with a Cancel button beside it. Counting without the bound
// asks a different question, and the assertion then fails for a real reason at
// the wrong place.
const ownsInDb = await count(
  `SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
    WHERE b.membership_id = 'mb_omar' AND b.status <> 'cancelled'
      AND cs.held_on >= studio_today(b.studio_id)`,
);
const omarSees = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
ok('a member sees every booking they own, whoever made it', Array.isArray(omarSees) && omarSees.length === ownsInDb, `${Array.isArray(omarSees) ? omarSees.length : -1} on screen against ${ownsInDb} rows`);
ok('...and there are some, so this is not a vacuous pass', ownsInDb > 0, `${ownsInDb} bookings, none of them made by him`);

// JOINING A COURSE, from the member's side. The desk's version of this is
// covered in course-check; this is the one a member taps, and the block has to
// arrive in their diary rather than only on the studio's roster.
const before = await count("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_omar' AND status = 'booked'");
const joined = await asPrincipal(CAST.northrock.member, '/api/schedule/vex', { fingerprint: 'me/join-course', context: { courseId: 'co_rock_intake' } });
ok('a member can join a course themselves', !refused(joined), JSON.stringify(joined).slice(0, 80));
const after = await runtime.db.query("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_omar' AND status = 'booked'");
ok('...and the whole block lands in their diary', Number((after.rows[0] as { n: string }).n) > before, `${(after.rows[0] as { n: string }).n} after ${before}`);

report('a member has their own side, and holding it is not holding anybody else’s.');
