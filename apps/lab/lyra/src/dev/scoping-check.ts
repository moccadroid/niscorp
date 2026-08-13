// Run: pnpm --filter lyra exec tsx src/dev/scoping-check.ts
import { CAST } from '@lyra/db/seed';
import { resolvePolicy } from '@niscorp/moss';
import { app, asPrincipal, ok, report, runtime } from './world';

const count = async (sql: string): Promise<number> => Number((await runtime.db.query<{ n: string }>(sql)).rows[0]?.n ?? -1);

const UPCOMING = "AND session_id IN (SELECT id FROM class_sessions WHERE held_on >= studio_today('st_lumen'))";
const mine = await count(`SELECT count(*) n FROM bookings WHERE person_id = 'p_ava' AND status = 'booked' ${UPCOMING}`);
const studio = await count(`SELECT count(*) n FROM bookings WHERE studio_id = 'st_lumen' AND status = 'booked' ${UPCOMING}`);
ok('the seed has both quantities to tell apart', mine > 0 && studio > mine, `${mine} of Ava's against ${studio} at the studio`);

// ── the same fingerprint, from two rungs ─────────────────────
const asMember = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const asDesk = await asPrincipal(CAST.lumen.desk, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });

const memberRows = Array.isArray(asMember) ? asMember.length : -1;
const deskRows = Array.isArray(asDesk) ? asDesk.length : -1;

ok('a member reads their own bookings from the REAL table', memberRows === mine, `${memberRows} rows against ${mine} of theirs`);

ok('...and a desk replaying the identical fingerprint gets nothing', deskRows === 0, `${deskRows} rows — no membership, no match`);

const ids = new Set((Array.isArray(asMember) ? asMember : []).map((r) => String((r as { booking_id?: unknown }).booking_id ?? '')));
const foreignRows = await count(
  `SELECT count(*) n FROM bookings WHERE person_id <> 'p_ava' AND id IN (${[...ids].map((i) => `'${i}'`).join(',') || `''`})`,
);
ok('...and not one of those rows belongs to anybody else', foreignRows === 0, `${foreignRows} foreign row(s) in a ${memberRows}-row answer`);

// ── the tenant rule still stacks ─────────────────────────────
const foreign = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const northRock = Array.isArray(foreign) ? foreign.length : -1;
ok('another studio’s member reads their own, at their own studio', northRock > 0, `${northRock} rows`);
const leaked = await count(
  `SELECT count(*) n FROM bookings WHERE studio_id = 'st_lumen' AND id IN (${(Array.isArray(foreign) ? foreign : []).map((r) => `'${String((r as { booking_id?: unknown }).booking_id ?? '')}'`).join(',') || `''`})`,
);
ok('...with no Lumen row among them', leaked === 0, 'the personal rule ANDs onto the tenant rule, it does not replace it');

// ── reach itself, read off the compiled policy ───────────────
const BOOKING_GRANTS = ['bookings.read', 'bookings.write.insert', 'bookings.write.update'];

const rulesFor = (personId: string, phase: 'read'): number => {
  const entity = resolvePolicy(app, BOOKING_GRANTS, personId).entities['bookings'];
  return entity === undefined || 'public' in entity || 'deny' in entity ? -1 : (entity[phase] ?? []).length;
};

const memberRules = rulesFor('p_ava', 'read');
const deskRules = rulesFor('p_ines', 'read');
ok("a member's policy filters bookings by more than the tenant", memberRules > deskRules, `${memberRules} rule(s) against the desk's ${deskRules}`);
ok('...and the desk keeps the roster it exists to read', deskRules >= 1, `${deskRules} rule(s) — the tenant boundary, and nothing narrower`);

// ── a profile is a floor, not a ceiling ──────────────────────
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

const own = await runtime.db.query<{ n: string }>(
  `SELECT count(*) AS n FROM bookings b
     JOIN class_sessions cs ON cs.id = b.session_id
    WHERE b.person_id = 'p_tobias' AND b.status <> 'cancelled'
      AND cs.held_on >= studio_today('st_lumen')`,
);
ok('...and that is exactly how many he has', teacherRows === Number(own.rows[0]?.n ?? -1), `${teacherRows} against ${own.rows[0]?.n} in the table`);

report('one table, two reaches — and a member surface that pins itself as well, because holding two roles widens the first.');
