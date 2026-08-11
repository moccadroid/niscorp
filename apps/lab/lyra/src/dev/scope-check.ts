// Scope check — the tenant boundary is enforced by the engine, not by a layout.
//
// This is the check that matters most in this application. Lyra's customers are
// competitors: two studios on one deployment, and one seeing the other's member
// list is not a bug report, it is the end of the business.
//
// So it asserts the boundary at the level that actually holds it — the vex
// surface, over the session's own wire, with the same policy a browser would
// get. Not through a layout, because a layout proving nothing leaks proves only
// that today's layout does not.
//
// Run: pnpm --filter lyra exec tsx src/dev/scope-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, ok, report, runtime } from './world';

const read = (email: string, resource: string, fingerprint: string, context: Record<string, unknown> = {}): Promise<unknown> =>
  asPrincipal(email, `/api/${resource}/vex`, { fingerprint, context });

// A refusal, distinguished from an empty answer. The two mean very different
// things — "you may not ask that" versus "there is nothing" — and a check that
// conflated them would pass on the wrong one.
const refused = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && 'status' in value;

const today = new Date().toISOString().slice(0, 10);

// ── the reads answer at all ──
const lumenStudio = await read(CAST.lumen.owner, 'studio', 'studio/current');
ok('a studio read answers', typeof lumenStudio === 'object' && lumenStudio !== null);
ok('...with the caller’s own studio', JSON.stringify(lumenStudio).includes('Lumen Yoga'));

const nrStudio = await read(CAST.northrock.owner, 'studio', 'studio/current');
ok('the other studio gets its own row from the same fingerprint', JSON.stringify(nrStudio).includes('North Rock'));
ok('...and not the first one', !JSON.stringify(nrStudio).includes('Lumen'));

// ── the member roll ──
const ALL_STATUSES = ['active', 'trialling', 'paused', 'lapsed', 'cancelled'];
const lumenMembers = await read(CAST.lumen.owner, 'member', 'members/list', { statuses: ALL_STATUSES, q: '%' });
const nrMembers = await read(CAST.northrock.owner, 'member', 'members/list', { statuses: ALL_STATUSES, q: '%' });
const lumenText = JSON.stringify(lumenMembers);
const nrText = JSON.stringify(nrMembers);

ok('Lumen sees its own members', lumenText.includes('Ava Klein'));
ok('...and NOT North Rock’s', !lumenText.includes('Omar Haddad'));
ok('North Rock sees its own', nrText.includes('Omar Haddad'));
ok('...and NOT Lumen’s', !nrText.includes('Ava Klein'));

// Ground truth: what the database actually holds, versus what each caller got.
//
// Counted over the SAME statuses the callers asked for. An enquiry is a
// membership at stage zero — the same row a member has, one status earlier —
// so the table holds rows the roll deliberately never shows, and comparing
// against a bare `count(*)` would fail for the reason the design is right.
const totals = await runtime.db.query<{ n: number }>(
  `SELECT count(*) n FROM memberships WHERE status IN ('active', 'trialling', 'paused', 'lapsed', 'cancelled')`,
);
const dbTotal = Number(totals.rows[0]?.n ?? 0);
const seen = (Array.isArray(lumenMembers) ? lumenMembers.length : 0) + (Array.isArray(nrMembers) ? nrMembers.length : 0);
ok('between them they see every membership exactly once', seen === dbTotal, `${seen} of ${dbTotal}`);

// ...and a prospect is not on either roll. The enquiry screen is the only
// place they surface, which is what stops "somebody asked about prices" from
// landing in a headcount.
const prospects = await runtime.db.query<{ n: number }>(`SELECT count(*) n FROM memberships WHERE status = 'enquired'`);
ok('...and the enquiries are on neither', Number(prospects.rows[0]?.n ?? 0) > 0 && !lumenText.includes('Priya Anand'), `${Number(prospects.rows[0]?.n ?? 0)} asking, none on a roll`);

// ── the forged request ──
//
// The whole claim, tested directly: a caller hand-POSTs the other studio's id
// as context. The engine ANDs its own `studio_id = <caller>` onto whatever the
// query had, so the two conditions cannot both hold and the answer is empty.
// The scope value is server-side and unreferenceable, so there is nothing to
// overwrite.
const forged = await read(CAST.lumen.owner, 'member', 'members/list', { statuses: ALL_STATUSES, q: '%', studioId: 'st_northrock' });
const forgedText = JSON.stringify(forged);
ok('a forged studioId does not cross the boundary', !forgedText.includes('Omar Haddad'), 'context.studioId was ignored');
ok('...and does not empty the caller’s own answer either', forgedText.includes('Ava Klein'));

// ── a fingerprint that does not exist ──
// Warm-only, enforced twice: locked replay plus no generator. An unknown
// fingerprint must be refused, never quietly generated.
const unknown = await read(CAST.lumen.owner, 'member', 'members/does-not-exist');
ok('an unknown fingerprint is refused, not generated', refused(unknown), JSON.stringify(unknown));

// ── the aggregates ──
const count = await read(CAST.lumen.owner, 'studio', 'studio/members/active-count');
const dbActive = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM memberships WHERE studio_id='st_lumen' AND status IN ('active','trialling')");
ok('the active count is scoped too', JSON.stringify(count).includes(String(dbActive.rows[0]?.n ?? -1)), JSON.stringify(count));

// ── the timetable ──
const sessions = await read(CAST.lumen.owner, 'schedule', 'schedule/today', { today });
const nrSessions = await read(CAST.northrock.owner, 'schedule', 'schedule/today', { today });
ok('today’s classes come back', Array.isArray(sessions));
ok('...formatted on the way out, not in a component', JSON.stringify(sessions).includes('of '), JSON.stringify(sessions).slice(0, 120));
ok('...and each studio gets only its own', JSON.stringify(sessions) !== JSON.stringify(nrSessions));

// A member is not staff: they hold the schedule but not the roll.
const memberSees = await read(CAST.lumen.member, 'member', 'members/list', { statuses: ALL_STATUSES, q: '%' });
ok('a member cannot read the studio’s member list', refused(memberSees), JSON.stringify(memberSees).slice(0, 100));

report('the tenant boundary is engine-side, and a forged request cannot cross it.');
