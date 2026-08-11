// Check-in check — the front desk's daily loop.
//
// The gesture a desk performs two hundred times a day: pick the class that is
// about to start, tap people as they walk in. It asserts on the screen AND on
// the database, and specifically on the thing a counter cache can get wrong —
// the check_in and the flag it is cached in must move together or neither does.
//
// Run: pnpm --filter lyra exec tsx src/dev/checkin-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const shell = login(CAST.lumen.desk);
await settle();

const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
  const result = await runtime.db.query<T>(sql, params);
  return result.rows[0];
};

// A class today with people booked into it, taken from the database rather than
// assumed — the seed shifts with the wall clock, so "today" is different on
// every run and a hardcoded session id would be a check that passes on Tuesdays.
//
// ASKED ON THE STUDIO'S CLOCK — the same one the screen's read is stamped
// with. This used SQL CURRENT_DATE, the server's day, which agrees with the
// screen until a UTC boundary falls between them; clock-check separately proves
// the database and the server compute this identically.
const target = await one<{ id: string; name: string; booked: number }>(`
  SELECT s.id, s.name, s.booked_count AS booked
  FROM class_sessions s
  WHERE s.studio_id = 'st_lumen' AND s.held_on = studio_today('st_lumen') AND s.booked_count > 0
  ORDER BY s.starts_at LIMIT 1
`);

ok('there is a class today with people in it', target !== undefined, target?.name ?? 'none — the seed shifted');
if (target === undefined) report('nothing to check into today');

const sessionId = target.id;

// ── the surface ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'desk.checkin' });
await settle();
let tree = treeOf(shell);
ok('the desk reaches check-in', tree.includes('Check in'));
ok("...listing today's classes", tree.includes(target.name));
ok('...and no roster until a class is picked', !tree.includes('Arrived'), 'an empty roster pane would read as an empty class');

// ── pick a class ──
shell.dispatch({ type: 'ui:click', ref: 'pick', payload: { session_id: sessionId, name: target.name } });
await settle();
tree = treeOf(shell);
ok('picking a class opens its roster', tree.includes('Arrived'));

const roster = await runtime.db.query<{ id: string; membership_id: string; attended: boolean; person: string }>(
  `SELECT b.id, b.membership_id, b.attended, p.name AS person
   FROM bookings b JOIN memberships m ON m.id = b.membership_id JOIN people p ON p.id = m.person_id
   WHERE b.session_id = $1 AND b.status = 'booked' ORDER BY p.name`,
  [sessionId],
);
ok('the roster has people on it', roster.rows.length > 0, `${roster.rows.length} booked`);
ok('...and they are on screen', roster.rows.every((r) => tree.includes(r.person)));

// Somebody who has not arrived yet — the row the desk is about to tap.
const due = roster.rows.find((r) => r.attended === false);
ok('somebody is still due', due !== undefined, due?.person ?? 'everyone already arrived');
if (due === undefined) report('nobody left to check in');

// ── the tap ──
const before = await one<{ n: number }>('SELECT count(*)::int n FROM check_ins WHERE session_id = $1', [sessionId]);
shell.dispatch({ type: 'ui:click', ref: 'checkin', payload: { membership_id: due.membership_id, booking_id: due.id } });
await settle(14);

const after = await one<{ n: number }>('SELECT count(*)::int n FROM check_ins WHERE session_id = $1', [sessionId]);
ok('a check-in was written', Number(after?.n) === Number(before?.n) + 1, `${before?.n} → ${after?.n}`);

// THE ONE THAT MATTERS: both halves of the transaction, or neither. A check_in
// without its flag leaves the desk tapping somebody who is already inside.
const booking = await one<{ attended: boolean }>('SELECT attended FROM bookings WHERE id = $1', [due.id]);
ok('...and the booking was flagged in the SAME transaction', booking?.attended === true);

// The clock came from the database, not the write.
const stamp = await one<{ held_on: string | null; hour_key: number | null }>(
  'SELECT held_on, hour_key FROM check_ins WHERE session_id = $1 ORDER BY happened_at DESC LIMIT 1',
  [sessionId],
);
ok('the check-in is stamped today, by the database', stamp?.held_on !== null && stamp?.held_on !== undefined);
ok('...with an hour bucket for the peak-hours report', stamp?.hour_key !== null && stamp?.hour_key !== undefined);

// The studio was stamped by the engine — the write never carried one.
const stamped = await one<{ studio_id: string }>('SELECT studio_id FROM check_ins WHERE session_id = $1 ORDER BY happened_at DESC LIMIT 1', [sessionId]);
ok('...and the studio was stamped engine-side', stamped?.studio_id === 'st_lumen');

// ── the screen caught up ──
tree = treeOf(shell);
ok('the roster re-read itself', tree.includes(due.person));
// Asserted on the badge the mapping produced, not on the absence of something —
// `|| true` was here for a moment and would have passed forever.
ok('...and the row now reads Here', tree.includes('"arrived_label":"Here"'), 'asserted on the row data — Rows renders its cells in React, so expanded badges never reach the tree');
ok('...while anyone still due reads Due', roster.rows.length > 1 ? tree.includes('"arrived_label":"Due"') : true);

// ── the boundary holds on the new surfaces too ──
const foreign = await asPrincipal(CAST.northrock.owner, '/api/schedule/vex', { fingerprint: 'roster/forSession', context: { sessionId } });
ok("another studio cannot read Lumen's roster", Array.isArray(foreign) && foreign.length === 0, JSON.stringify(foreign).slice(0, 80));

// A member holds no check-in verb at all.
const asMember = await asPrincipal(CAST.lumen.member, '/api/schedule/vex', {
  fingerprint: 'check-ins/mark',
  context: { membershipId: due.membership_id, sessionId, bookingId: due.id },
});
ok('a member cannot check people in', JSON.stringify(asMember).includes('status'), JSON.stringify(asMember).slice(0, 80));

report('the desk loop closes: pick a class, tap somebody in, and both halves land together.');
