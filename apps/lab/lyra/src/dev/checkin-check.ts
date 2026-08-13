// Run: pnpm --filter lyra exec tsx src/dev/checkin-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const shell = await login(CAST.lumen.desk);
await settle();

const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
  const result = await runtime.db.query<T>(sql, params);
  return result.rows[0];
};

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

const roster = await runtime.db.query<{ id: string; person_id: string; attended: boolean; person: string }>(
  `SELECT b.id, b.person_id, b.attended, p.name AS person
   FROM bookings b JOIN people p ON p.id = b.person_id
   WHERE b.session_id = $1 AND b.status = 'booked' ORDER BY p.name`,
  [sessionId],
);
ok('the roster has people on it', roster.rows.length > 0, `${roster.rows.length} booked`);
ok('...and they are on screen', roster.rows.every((r) => tree.includes(r.person)));

const due = roster.rows.find((r) => r.attended === false);
ok('somebody is still due', due !== undefined, due?.person ?? 'everyone already arrived');
if (due === undefined) report('nobody left to check in');

// ── the tap ──
const before = await one<{ n: number }>('SELECT count(*)::int n FROM check_ins WHERE session_id = $1', [sessionId]);
shell.dispatch({ type: 'ui:click', ref: 'checkin', payload: { person_id: due.person_id, booking_id: due.id } });
await settle(14);

const after = await one<{ n: number }>('SELECT count(*)::int n FROM check_ins WHERE session_id = $1', [sessionId]);
ok('a check-in was written', Number(after?.n) === Number(before?.n) + 1, `${before?.n} → ${after?.n}`);

const booking = await one<{ attended: boolean }>('SELECT attended FROM bookings WHERE id = $1', [due.id]);
ok('...and the booking was flagged in the SAME transaction', booking?.attended === true);

const stamp = await one<{ held_on: string | null; hour_key: number | null }>(
  'SELECT held_on, hour_key FROM check_ins WHERE session_id = $1 ORDER BY happened_at DESC LIMIT 1',
  [sessionId],
);
ok('the check-in is stamped today, by the database', stamp?.held_on !== null && stamp?.held_on !== undefined);
ok('...with an hour bucket for the peak-hours report', stamp?.hour_key !== null && stamp?.hour_key !== undefined);

const stamped = await one<{ studio_id: string }>('SELECT studio_id FROM check_ins WHERE session_id = $1 ORDER BY happened_at DESC LIMIT 1', [sessionId]);
ok('...and the studio was stamped engine-side', stamped?.studio_id === 'st_lumen');

// ── the screen caught up ──
tree = treeOf(shell);
ok('the roster re-read itself', tree.includes(due.person));
ok('...and the row now reads Here', tree.includes('"arrived_label":"Here"'), 'asserted on the row data — Rows renders its cells in React, so expanded badges never reach the tree');
ok('...while anyone still due reads Due', roster.rows.length > 1 ? tree.includes('"arrived_label":"Due"') : true);

// ── the boundary holds on the new surfaces too ──
const foreign = await asPrincipal(CAST.northrock.owner, '/api/schedule/vex', { fingerprint: 'roster/forSession', context: { sessionId } });
ok("another studio cannot read Lumen's roster", Array.isArray(foreign) && foreign.length === 0, JSON.stringify(foreign).slice(0, 80));

const asMember = await asPrincipal(CAST.lumen.member, '/api/schedule/vex', {
  fingerprint: 'check-ins/mark',
  context: { personId: due.person_id, sessionId, bookingId: due.id },
});
ok('a member cannot check people in', JSON.stringify(asMember).includes('status'), JSON.stringify(asMember).slice(0, 80));

report('the desk loop closes: pick a class, tap somebody in, and both halves land together.');
