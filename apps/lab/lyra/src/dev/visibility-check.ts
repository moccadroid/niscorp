// Run: pnpm --filter lyra exec tsx src/dev/visibility-check.ts
import { CAST } from '@lyra/db/seed';
import { areasFor } from '@lyra/app/nav/sections';
import { resolveCatalog } from '@niscorp/moss';
import { app, asPrincipal, idFor, idsFor, ok, report, runtime } from './world';
import { fillPhrase } from '@lyra/ui/lib/phrase';

const read = (email: string, fingerprint: string, context: Record<string, unknown> = {}): Promise<unknown> =>
  asPrincipal(email, '/api/schedule/vex', { fingerprint, context });

const busiest = await runtime.db.query<{ session_id: string; n: string }>(
  "SELECT session_id, count(*) AS n FROM bookings WHERE studio_id = 'st_lumen' AND status <> 'cancelled' GROUP BY session_id ORDER BY n DESC, session_id LIMIT 1",
);
const sessionId = String(busiest.rows[0]?.session_id ?? '');
const booked = Number(busiest.rows[0]?.n ?? -1);
ok('the seed has a class worth looking at', booked > 1, `${booked} people in it`);

// ── the owner ────────────────────────────────────────────────
const detail = (await read(CAST.lumen.owner, 'session/detail', { sessionId })) as Record<string, unknown>;
ok('an owner can ask about one class', typeof detail['name'] === 'string' && detail['name'] !== '', String(detail['name']));
// A number, a word, a number — in whatever language the studio reads. The
// figure now travels as a counted PATTERN and fills at the glass, so the
// assertion fills it the same way before asking.
ok('...and is told how full it is', /\d+\s+\p{L}+\s+\d+/u.test(String(fillPhrase(detail['booked_display']) ?? '')), String(fillPhrase(detail['booked_display'])));

const attending = (await read(CAST.lumen.owner, 'session/attending', { sessionId })) as unknown[];
ok('...and WHO is in it, by name', Array.isArray(attending) && attending.length === booked, `${Array.isArray(attending) ? attending.length : -1} against ${booked} in the table`);
ok(
  '...each with a name and a place, not an id',
  Array.isArray(attending) && attending.every((r) => typeof (r as { person_name?: unknown }).person_name === 'string' && (r as { person_name: string }).person_name !== ''),
);

await runtime.db.query('UPDATE class_sessions SET capacity = booked_count WHERE id = $1', [sessionId]);
const queuer = await runtime.db.query<{ id: string }>(
  `SELECT sp.person_id AS id FROM studio_people sp
    WHERE sp.studio_id = 'st_lumen'
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = $1 AND b.person_id = sp.person_id)
    LIMIT 1`,
  [sessionId],
);
const joiner = String(queuer.rows[0]?.id ?? '');
await runtime.db.query(
  `INSERT INTO bookings (studio_id, session_id, person_id)
   SELECT sp.studio_id, $1, sp.person_id FROM studio_people sp WHERE sp.person_id = $2 AND sp.studio_id = 'st_lumen'`,
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
ok('the owner holds the screen it lives on', (await idsFor(CAST.lumen.owner)).includes('schedule.session'));
ok('...and reaches it from the timetable, which is in their menu', areasFor(await idsFor(CAST.lumen.owner)).some((a) => a.items.some((i) => i.action === 'schedule.timetable')));

// ── the same fault, one rung down ────────────────────────────
const teacher = await idsFor(CAST.lumen.instructor);
ok('a teacher who trains here holds the membership screen', teacher.includes('me.membership'));
ok(
  '...and it is in his menu, not just in his grants',
  areasFor(teacher).some((a) => a.items.some((i) => i.action === 'me.membership')),
  'a grant with no destination is a screen nobody can open',
);

const card = (await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/card', context: {} })) as Record<string, unknown>;
ok('...and it answers with HIS card', card['status_label'] === 'Staff', `standing: ${String(card['status_label'])} — the roll’s own derivation, pinned to him`);
const teacherPlan = (await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/membership', context: {} })) as Record<string, unknown>;
ok('...and his own plan beside it', typeof teacherPlan['plan_name'] === 'string' && teacherPlan['plan_name'] !== '', String(teacherPlan['plan_name']));

ok('the front desk is offered no membership screen', !areasFor(await idsFor(CAST.lumen.desk)).some((a) => a.items.some((i) => i.action === 'me.membership')));

report('the owner can see who is coming, and a teacher who trains here can reach their own card.');
