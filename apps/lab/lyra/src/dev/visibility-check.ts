// WHAT THE OWNER CAN SEE ABOUT THEIR OWN CLASSES.
//
// Asked for three times and missing for as long: an owner had headline figures
// and a calendar of fill counts, and no way to ask "who is coming to this".
// Tapping a class opened the DESK's check-in tool — a sheet carrying its own
// today-only class picker, with the roster of a class next Monday underneath.
//
// The second half is the same shape one rung down: a landing surface is only
// reachable by landing on it, so a teacher who also trains here held a
// membership card with no route to it. Both were grants without destinations.
//
// Run: pnpm --filter lyra exec tsx src/dev/visibility-check.ts
import { CAST } from '@lyra/db/seed';
import { areasFor } from '@lyra/app/nav/sections';
import { resolveCatalog } from '@niscorp/moss';
import { personByEmail } from '@lyra/server/users';
import { app, asPrincipal, ok, report, runtime } from './world';

const idsFor = (email: string): readonly string[] => resolveCatalog(app, personByEmail(email)?.id ?? null).ids;
const read = (email: string, fingerprint: string, context: Record<string, unknown> = {}): Promise<unknown> =>
  asPrincipal(email, '/api/schedule/vex', { fingerprint, context });

// A class with people in it, chosen from the data rather than named — a
// hardcoded id here would go stale the first time the seed moved.
const busiest = await runtime.db.query<{ session_id: string; n: string }>(
  "SELECT session_id, count(*) AS n FROM bookings WHERE studio_id = 'st_lumen' AND status <> 'cancelled' GROUP BY session_id ORDER BY n DESC, session_id LIMIT 1",
);
const sessionId = String(busiest.rows[0]?.session_id ?? '');
const booked = Number(busiest.rows[0]?.n ?? -1);
ok('the seed has a class worth looking at', booked > 1, `${booked} people in it`);

// ── the owner ────────────────────────────────────────────────
const detail = (await read(CAST.lumen.owner, 'session/detail', { sessionId })) as Record<string, unknown>;
ok('an owner can ask about one class', typeof detail['name'] === 'string' && detail['name'] !== '', String(detail['name']));
ok('...and is told how full it is', String(detail['booked_display'] ?? '').includes('of'), String(detail['booked_display']));

const attending = (await read(CAST.lumen.owner, 'session/attending', { sessionId })) as unknown[];
ok('...and WHO is in it, by name', Array.isArray(attending) && attending.length === booked, `${Array.isArray(attending) ? attending.length : -1} against ${booked} in the table`);
ok(
  '...each with a name and a place, not an id',
  Array.isArray(attending) && attending.every((r) => typeof (r as { person_name?: unknown }).person_name === 'string' && (r as { person_name: string }).person_name !== ''),
);

// THE QUEUE, which is the half `roster/forSession` leaves out on purpose — the
// desk checks in the people who are actually coming. Five waiting is the
// difference between "popular" and "put another one on", so an owner's view
// has to carry it.
//
// The seed has no waitlisted booking, so one is made HERE, through the real
// path: shrink the class to the seats already taken and let a member book. The
// queue then forms the way it forms in production, in the capacity trigger,
// rather than being written straight into the table — which would test this
// check's SQL instead of the studio's rule.
await runtime.db.query('UPDATE class_sessions SET capacity = booked_count WHERE id = $1', [sessionId]);
const queuer = await runtime.db.query<{ id: string }>(
  `SELECT m.id FROM memberships m
    WHERE m.studio_id = 'st_lumen'
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = $1 AND b.membership_id = m.id)
    LIMIT 1`,
  [sessionId],
);
const joiner = String(queuer.rows[0]?.id ?? '');
await runtime.db.query(
  `INSERT INTO bookings (studio_id, session_id, membership_id)
   SELECT m.studio_id, $1, m.id FROM memberships m WHERE m.id = $2`,
  [sessionId, joiner],
);
const queued = await runtime.db.query<{ n: string }>(
  "SELECT count(*) AS n FROM bookings WHERE session_id = $1 AND status = 'waitlisted'",
  [sessionId],
);
ok('a full class queues the next person', Number(queued.rows[0]?.n ?? 0) === 1, 'made here, by the studio\'s own trigger');

const withQueue = (await read(CAST.lumen.owner, 'session/attending', { sessionId })) as { place_label?: string }[];
ok('...and the owner sees them waiting, not missing', withQueue.some((r) => r.place_label === 'Waiting'), `${withQueue.length} holding a place, ${withQueue.filter((r) => r.place_label === 'Waiting').length} of them waiting`);
ok('...with the confirmed places still first', withQueue[0]?.place_label === 'Booked', withQueue.map((r) => r.place_label).join(', '));

// ── a destination, not just a grant ──────────────────────────
ok('the owner holds the screen it lives on', idsFor(CAST.lumen.owner).includes('schedule.session'));
ok('...and reaches it from the timetable, which is in their menu', areasFor(idsFor(CAST.lumen.owner)).some((a) => a.items.some((i) => i.action === 'schedule.timetable')));

// ── the same fault, one rung down ────────────────────────────
//
// Tobias teaches here and trains here. He held `home.member` — a LANDING
// surface, reachable only by landing, and he lands on the instructor's day.
const teacher = idsFor(CAST.lumen.instructor);
ok('a teacher who trains here holds the membership screen', teacher.includes('me.membership'));
ok(
  '...and it is in his menu, not just in his grants',
  areasFor(teacher).some((a) => a.items.some((i) => i.action === 'me.membership')),
  'a grant with no destination is a screen nobody can open',
);

const card = (await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/card', context: {} })) as Record<string, unknown>;
ok('...and it answers with HIS card', typeof card['plan_name'] === 'string' && card['plan_name'] !== '', String(card['plan_name']));

// Staff who do not train hold neither, which is what keeps the menu honest.
ok('the front desk is offered no membership screen', !areasFor(idsFor(CAST.lumen.desk)).some((a) => a.items.some((i) => i.action === 'me.membership')));

report('the owner can see who is coming, and a teacher who trains here can reach their own card.');
