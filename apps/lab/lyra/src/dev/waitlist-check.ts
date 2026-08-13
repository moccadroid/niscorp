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
const owner = await login(CAST.lumen.owner);
await settle(10);
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle(12);
ok('the grid offers a one-off', treeOf(owner).includes('Add a one-off'), 'the concept existed; the door did not');

owner.dispatch({ type: 'ui:click', ref: 'addEvent' });
await settle(14);
let tree = treeOf(owner);
ok('...on its own screen', tree.includes('one date, and no weekly rule behind it'));
ok('...with a date rather than a weekday', tree.includes('"label":"Date"') && !tree.includes('"label":"Day"'), 'that difference IS the difference between the two');

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

ok('...and its report buckets derived', (await count("SELECT count(*) n FROM class_sessions WHERE name = 'Inversions masterclass' AND week_key <> '' AND hour_key = 14")) === 1, 'vex has no date functions, so these are columns');

const eventId = (await runtime.db.query<{ id: string }>("SELECT id FROM class_sessions WHERE name = 'Inversions masterclass'")).rows[0]?.id ?? '';

const member = await login(CAST.lumen.member);
await settle(12);
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(14);
ok('a member is offered the one-off', treeOf(member).includes('Inversions masterclass'), 'no branch anywhere knows it has no template');

// ── the queue ────────────────────────────────────────────────
const seat1 = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: eventId } });
ok('the first member books', !refused(seat1));
const seat2 = await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: eventId } });
ok('...and the second fills it', !refused(seat2));
ok('...leaving no room', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 2);

const third = await asPrincipal('lena.gruber@example.com', '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: eventId } });
ok('a full class does NOT refuse the third', !refused(third), 'turning them away loses the one fact a studio most wants');
ok('...it queues them', (await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_lena' AND session_id = $1 AND status = 'waitlisted'", [eventId])) === 1);
ok('...without taking a seat', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 2, 'the counter counts `booked` only');

// ── the queue moves itself ───────────────────────────────────
const avaBooking = (await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE person_id = 'p_ava' AND session_id = $1", [eventId])).rows[0]?.id ?? '';
await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/cancel', context: { bookingId: avaBooking } });

ok('a cancellation promotes the person waiting', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND person_id = 'p_lena' AND status = 'booked'", [eventId])) === 1, 'in the database, because two cancellations landing together must not promote three people');
ok('...and it is the one row everybody reads', (await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_lena' AND session_id = $1 AND status = 'waitlisted'", [eventId])) === 0, 'one row, so the member and the desk cannot disagree');
ok('...and the class is full again', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 2);
ok('...with nobody left waiting', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND status = 'waitlisted'", [eventId])) === 0);

const lenaBooking = (await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE person_id = 'p_lena' AND session_id = $1", [eventId])).rows[0]?.id ?? '';
await asPrincipal('lena.gruber@example.com', '/api/me/vex', { fingerprint: 'me/cancel', context: { bookingId: lenaBooking } });
ok('a cancellation with an empty queue just frees the seat', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [eventId])) === 1);

// ── what the member is told ──────────────────────────────────
const jonas = await login(CAST.lumen.instructor);
await settle(12);
jonas.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.bookings' });
await settle(14);
tree = treeOf(jonas);
ok('a member sees the class they were promoted into', tree.includes('Inversions masterclass'));
ok('...marked as booked, not waiting', tree.includes('"state_label":"Booked"'));

member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(12);
ok('the booking message does not promise a seat', !treeOf(member).includes('See you there'), 'the badge on My classes carries the truth; this must not contradict it');

report('full is a queue that moves itself, and a class needs no weekly rule to exist.');
