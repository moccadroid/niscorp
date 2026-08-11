// Waitlist and one-off check — full is a queue, and a class needs no rule.
//
// Two features, one file, because they are the two things the schedule could
// not express and both turned out to be smaller than they looked:
//
//   A ONE-OFF is a session with no template. `class_sessions.template_id` has
//   been nullable since the first schema, so the model always allowed it —
//   what was missing was a screen, not a concept.
//
//   A WAITLIST is a booking with a different status. `bookings.status` already
//   listed `waitlisted` in its comment, the counter cache already counted only
//   `booked`, and the capacity check already let other statuses past. It cost
//   one branch and a promotion trigger.
//
// The promotion is in the DATABASE, and that is the load-bearing decision: a
// seat can be freed by a member cancelling, a desk cancelling, a course
// withdrawal fanning out, or a studio calling a class off. Four writers, one
// rule — and a rule in four places is wrong in at least one.
//
// Run: pnpm --filter lyra exec tsx src/dev/waitlist-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};
const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { status?: unknown }).status === 'number';

// ── a one-off ────────────────────────────────────────────────
const owner = login(CAST.lumen.owner);
await settle(10);
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle(12);
ok('the grid offers a one-off', treeOf(owner).includes('Add a one-off'), 'the concept existed; the door did not');

owner.dispatch({ type: 'ui:click', ref: 'addEvent' });
await settle(14);
let tree = treeOf(owner);
ok('...on its own screen', tree.includes('one date, and no weekly rule behind it'));
ok('...with a date rather than a weekday', tree.includes('"label":"Date"') && !tree.includes('"label":"Day"'), 'that difference IS the difference between the two');

// Dated inside the member's fortnight window, because that is what they are
// offered — a one-off six weeks out is real and simply not on that screen yet.
const soon = (await runtime.db.query<{ d: string }>("SELECT to_char(CURRENT_DATE + 10, 'YYYY-MM-DD') d")).rows[0]?.d ?? '';
const before = await count("SELECT count(*) n FROM class_sessions WHERE studio_id = 'st_lumen'");
owner.dispatch({ type: 'ui:model', ref: 'name', payload: 'Inversions masterclass' });
owner.dispatch({ type: 'ui:model', ref: 'programId', payload: 'pr_vinyasa' });
owner.dispatch({ type: 'ui:model', ref: 'heldOn', payload: soon });
owner.dispatch({ type: 'ui:model', ref: 'startsAt', payload: '14:00' });
owner.dispatch({ type: 'ui:model', ref: 'durationMins', payload: 180 });
owner.dispatch({ type: 'ui:model', ref: 'capacity', payload: 2 });
await settle();
owner.dispatch({ type: 'ui:click', ref: 'create' });
await settle(16);

ok('a one-off lands on the calendar', (await count("SELECT count(*) n FROM class_sessions WHERE studio_id = 'st_lumen'")) === before + 1);
ok('...with no template behind it', (await count("SELECT count(*) n FROM class_sessions WHERE name = 'Inversions masterclass' AND template_id IS NULL")) === 1, 'which is all a one-off ever was');
ok('...stamped with this studio by the engine', (await count("SELECT count(*) n FROM class_sessions WHERE name = 'Inversions masterclass' AND studio_id = 'st_lumen'")) === 1);

// The buckets every report groups on are derived, so a hand-written session is
// indistinguishable from a generated one downstream.
ok('...and its report buckets derived', (await count("SELECT count(*) n FROM class_sessions WHERE name = 'Inversions masterclass' AND week_key <> '' AND hour_key = 14")) === 1, 'vex has no date functions, so these are columns');

const eventId = (await runtime.db.query<{ id: string }>("SELECT id FROM class_sessions WHERE name = 'Inversions masterclass'")).rows[0]?.id ?? '';

// A member sees it like any other class, because it IS any other class.
const member = login(CAST.lumen.member);
await settle(12);
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(14);
ok('a member is offered the one-off', treeOf(member).includes('Inversions masterclass'), 'no branch anywhere knows it has no template');

// ── the queue ────────────────────────────────────────────────
//
// Two seats. Ava and Tobias take them; Jonas arrives third.
const seat1 = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: eventId } });
ok('the first member books', !refused(seat1));
// THE INSTRUCTOR WHO ALSO TRAINS, and he is here on purpose.
//
// He stands on the instructor rung to read his roster, so his reach is
// studio-wide on reads — and  still stamps HIS membership, because
// the 'teaching' profile writes his own rows while reading everybody's. If
// reach were one thing per rung he would be unable to attend a class at the
// studio he teaches at.
const seat2 = await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: eventId } });
ok('...and the second fills it', !refused(seat2));
ok('...leaving no room', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 2);

// A THIRD person, arriving to a full room.
const third = await asPrincipal('lena.gruber@example.com', '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: eventId } });
ok('a full class does NOT refuse the third', !refused(third), 'turning them away loses the one fact a studio most wants');
ok('...it queues them', (await count("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_lena' AND session_id = $1 AND status = 'waitlisted'", [eventId])) === 1);
// There is no 'too' any more: the member's queue position and the studio's are
// the same row. This asserted a mirror agreed with its original.
ok('...without taking a seat', (await count("SELECT booked_count n FROM class_sessions WHERE id = $1", [eventId])) === 2, 'a queued booking is not a booked one');

// THE COUNTER MUST NOT MOVE. A waitlisted person is not occupying a seat, and
// a counter that counted them would report a class as full that has room.
ok('...without taking a seat', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 2, 'the counter counts `booked` only, which it already did');

// ── the queue moves itself ───────────────────────────────────
const avaBooking = (await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE membership_id = 'mb_ava' AND session_id = $1", [eventId])).rows[0]?.id ?? '';
await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/cancel', context: { bookingId: avaBooking } });

ok('a cancellation promotes the person waiting', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND membership_id = 'mb_lena' AND status = 'booked'", [eventId])) === 1, 'in the database, because two cancellations landing together must not promote three people');
// There is no second row to disagree. The bug this used to guard — a mirror
// still reading "waiting" about a class they now hold — is not expressible.
ok('...and it is the one row everybody reads', (await count("SELECT count(*) n FROM bookings WHERE membership_id = 'mb_lena' AND session_id = $1 AND status = 'waitlisted'", [eventId])) === 0, 'one row, so the member and the desk cannot disagree');
ok('...and the class is full again', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 2);
ok('...with nobody left waiting', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND status = 'waitlisted'", [eventId])) === 0);

// Nobody waiting is an ordinary outcome, not an error.
// Cancelled by its OWNER — the row filter rides on the update, so naming
// somebody else's booking id matches nothing.
const lenaBooking = (await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE membership_id = 'mb_lena' AND session_id = $1", [eventId])).rows[0]?.id ?? '';
await asPrincipal('lena.gruber@example.com', '/api/me/vex', { fingerprint: 'me/cancel', context: { bookingId: lenaBooking } });
ok('a cancellation with an empty queue just frees the seat', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 1);

// ── what the member is told ──────────────────────────────────
// TOBIAS, who took the second seat and never left — and who reaches his own
// bookings on the 'teaching' profile rather than the member one.
const jonas = login(CAST.lumen.instructor);
await settle(12);
jonas.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.bookings' });
await settle(14);
tree = treeOf(jonas);
ok('a member sees the class they were promoted into', tree.includes('Inversions masterclass'));
ok('...marked as booked, not waiting', tree.includes('"state_label":"Booked"'));

// The message a member sees must be true whichever way the click went. It said
// "Booked. See you there." for a waitlisted booking, which is the screen
// promising what the database did not do.
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(12);
ok('the booking message does not promise a seat', !treeOf(member).includes('See you there'), 'the badge on My classes carries the truth; this must not contradict it');

report('full is a queue that moves itself, and a class needs no weekly rule to exist.');
