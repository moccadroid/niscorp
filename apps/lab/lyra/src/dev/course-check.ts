// Run: pnpm --filter lyra exec tsx src/dev/course-check.ts
import { CAST } from '@lyra/db/seed';
import { areasFor } from '@lyra/app/nav/sections';
import { resolveCatalog } from '@niscorp/moss';
import { app, asPrincipal, idFor, idsFor, login, ok, report, runtime, settle, treeOf } from './world';


const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};
const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { status?: unknown }).status === 'number';

// ── a program is not a course ────────────────────────────────
ok('a program has no dates to carry', (await count("SELECT count(*) n FROM information_schema.columns WHERE table_name = 'programs' AND column_name LIKE '%_on'")) === 0);
ok('a course has both', (await count("SELECT count(*) n FROM information_schema.columns WHERE table_name = 'courses' AND column_name IN ('starts_on','ends_on')")) === 2);

// ── bounded recurrence ───────────────────────────────────────
const blockSessions = await count("SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found'");
ok('a block generates classes', blockSessions > 0, `${blockSessions} of them`);
ok('...and none outside its dates', (await count("SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND (cs.held_on < ct.starts_on OR cs.held_on > ct.ends_on)")) === 0);
ok('...while an ongoing class keeps running', (await count("SELECT count(*) n FROM class_sessions WHERE template_id = 'ct_l_mon_am' AND held_on > studio_today('st_lumen')")) > 0, 'both NULL is unbounded, which is the default');

// ── the manager's screen ─────────────────────────────────────
const owner = await login(CAST.lumen.owner);
await settle(8);
const offered = areasFor(await idsFor(CAST.lumen.owner)).flatMap((a) => a.items.map((i) => i.action));
ok('the owner is offered the Classes screen', offered.includes('timetable.list'), offered.join(', '));

owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle(12);
let tree = treeOf(owner);
ok('an owner reaches it', tree.includes('Everything this studio runs'));
ok('...and courses are ON it, beside the weekly classes', tree.includes('"is_course":true'), 'one list, which is the whole point of merging them');
ok('...with the dates that make it a block', tree.includes('runs_display'));
ok('...and a way to see who is on it', tree.includes('"ref":"roster"'), 'offered on course rows only — showKey: is_course');

// ── creating one ─────────────────────────────────────────────
const before = await count("SELECT count(*) n FROM courses WHERE studio_id = 'st_lumen'");
owner.dispatch({ type: 'ui:click', ref: 'addCourse' });
await settle();
owner.dispatch({ type: 'ui:model', ref: 'name', payload: 'Winter beginners' });
owner.dispatch({ type: 'ui:model', ref: 'programId', payload: 'pr_beginners' });
owner.dispatch({ type: 'ui:model', ref: 'blurb', payload: 'Six weeks, from nothing.' });
owner.dispatch({ type: 'ui:model', ref: 'startsOn', payload: '2026-11-02' });
owner.dispatch({ type: 'ui:model', ref: 'endsOn', payload: '2026-12-14' });
owner.dispatch({ type: 'ui:model', ref: 'capacity', payload: 10 });
owner.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 14000 });
await settle();

// Untick the default days and try anyway — headless dispatch does not look at
// disabled buttons, which is the point: the create request's FINGERPRINT
// resolves to a sentinel nothing answers, so the refusal is the wire's, not
// the button's. A course with no days must be uncreatable from any direction.
owner.dispatch({ type: 'ui:click', ref: 'mon', payload: { next: false } });
owner.dispatch({ type: 'ui:click', ref: 'wed', payload: { next: false } });
await settle();
owner.dispatch({ type: 'ui:click', ref: 'create' });
await settle(14);
ok('a dayless course is refused at the wire', (await count("SELECT count(*) n FROM courses WHERE studio_id = 'st_lumen'")) === before, 'the fingerprint itself is the guard');

owner.dispatch({ type: 'ui:click', ref: 'mon', payload: { next: true } });
owner.dispatch({ type: 'ui:click', ref: 'wed', payload: { next: true } });
await settle();
owner.dispatch({ type: 'ui:click', ref: 'create' });
await settle(14);

ok('a course can be created', (await count("SELECT count(*) n FROM courses WHERE studio_id = 'st_lumen'")) === before + 1);
ok('...with its dates and size', (await count("SELECT count(*) n FROM courses WHERE name = 'Winter beginners' AND capacity = 10 AND price_cents = 14000 AND starts_on = '2026-11-02'")) === 1);

ok(
  '...and it MEETS on days, not just between dates',
  (await count("SELECT count(*) n FROM class_templates ct JOIN courses c ON c.id = ct.course_id WHERE c.name = 'Winter beginners'")) === 2,
  'the form defaults to Monday and Wednesday; two ticks, two slots',
);
ok(
  '...so the block has actual classes',
  (await count("SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id JOIN courses c ON c.id = ct.course_id WHERE c.name = 'Winter beginners'")) > 0,
  'generated by the same trigger that fills the weekly timetable',
);
ok(
  '...bounded by the course, not running forever',
  (await count("SELECT count(*) n FROM class_sessions cs JOIN class_templates ct ON ct.id = cs.template_id JOIN courses c ON c.id = ct.course_id WHERE c.name = 'Winter beginners' AND (cs.held_on < DATE '2026-11-02' OR cs.held_on > DATE '2026-12-14')")) === 0,
  'a bounded block that generated sessions past its end would be worse than none',
);
ok(
  '...and every class carries the block’s capacity',
  (await count("SELECT count(*) n FROM class_templates ct JOIN courses c ON c.id = ct.course_id WHERE c.name = 'Winter beginners' AND ct.capacity = 10")) === 2,
  'a seat on the block is a seat in each of its classes',
);

const daysless = await runtime.db.query(
  "SELECT count(*) n FROM courses c WHERE c.studio_id = 'st_lumen' AND NOT EXISTS (SELECT 1 FROM class_templates ct WHERE ct.course_id = c.id)",
);
ok('no course exists without days to meet on', Number((daysless.rows[0] as { n: string }).n) === 0, 'a course with no slots has no classes, and used to be the default');
ok('...stamped with this studio by the engine', (await count("SELECT count(*) n FROM courses WHERE name = 'Winter beginners' AND studio_id = 'st_lumen'")) === 1, 'no form carries a studio id');
ok('...and the list shows it', treeOf(owner).includes('"name":"Winter beginners"'), 'asserted on the ROW, not the form field');

// ── the cohort ───────────────────────────────────────────────
owner.dispatch({ type: 'ui:click', ref: 'roster', payload: { course_id: 'co_lumen_found', name: 'Foundations — autumn block' } });
await settle(12);
tree = treeOf(owner);
ok('a course has a roster', tree.includes('Everybody who holds a place on this block'));
ok('...naming who is on it', tree.includes('Jonas Weber'), 'the cohort — what six separate bookings could not have told a studio');

// ── a member joins ───────────────────────────────────────────
const member = await login(CAST.lumen.member);
await settle(10);
const bookingsBefore = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_ava' AND status = 'booked'");

const joined = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/join-course', context: { courseId: 'co_lumen_found' } });
ok('a member can join a course', !refused(joined), JSON.stringify(joined).slice(0, 80));
ok('...creating ONE enrolment', (await count("SELECT count(*) n FROM enrolments WHERE person_id = 'p_ava' AND course_id = 'co_lumen_found' AND status = 'enrolled'")) === 1);

const bookingsAfter = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_ava' AND status = 'booked'");
ok('...which fanned out into the block’s classes', bookingsAfter > bookingsBefore, `${bookingsAfter - bookingsBefore} bookings from one enrolment`);
ok('...as ORDINARY bookings', (await count("SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND b.person_id = 'p_ava'")) > 0, 'the desk’s roster needs to know nothing about courses');
ok('...and the counter cache followed', (await count("SELECT enrolled_count n FROM courses WHERE id = 'co_lumen_found'")) === 2);

// ── capacity is the COURSE's ─────────────────────────────────
await runtime.db.query("UPDATE courses SET capacity = 2 WHERE id = 'co_lumen_found'");
const third = await asPrincipal(CAST.lumen.instructor, '/api/me/vex', { fingerprint: 'me/join-course', context: { courseId: 'co_lumen_found' } });
ok('a full course refuses the next person', refused(third), JSON.stringify(third).slice(0, 90));
ok('...and nobody was half-enrolled', (await count("SELECT count(*) n FROM enrolments WHERE course_id = 'co_lumen_found' AND status = 'enrolled'")) === 2, 'the check is in the database, so there is no race to lose');
await runtime.db.query("UPDATE courses SET capacity = 12 WHERE id = 'co_lumen_found'");

// ── joining twice, and leaving ───────────────────────────────
const twice = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/join-course', context: { courseId: 'co_lumen_found' } });
ok('a member cannot join the same course twice', refused(twice), JSON.stringify(twice).slice(0, 90));

const mine = await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/enrolments', context: {} });
ok('a member sees what they are on', JSON.stringify(mine).includes('Foundations'), JSON.stringify(mine).slice(0, 90));

const enrolmentId = (await runtime.db.query<{ id: string }>("SELECT id FROM enrolments WHERE person_id = 'p_ava'")).rows[0]?.id ?? '';
await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/leave-course', context: { enrolmentId } });
ok('withdrawing releases the enrolment', (await count("SELECT count(*) n FROM enrolments WHERE person_id = 'p_ava' AND status = 'withdrawn'")) === 1);
ok('...and frees the seats', (await count("SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND b.person_id = 'p_ava' AND b.status = 'booked' AND cs.held_on >= studio_today('st_lumen')")) === 0, 'seats held by somebody who left is how a studio finds out by counting chairs');
ok('...and the counter followed back down', (await count("SELECT enrolled_count n FROM courses WHERE id = 'co_lumen_found'")) === 1);

// ── who may decide what a block IS ───────────────────────────
const deskWrite = await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', {
  fingerprint: 'courses/update',
  context: { courseId: 'co_lumen_found', programId: 'pr_beginners', name: 'Free', blurb: '', startsOn: '2026-01-01', endsOn: '2026-02-01', capacity: 999, priceCents: 0 },
});
ok('the desk cannot change a course', refused(deskWrite), JSON.stringify(deskWrite).slice(0, 70));
ok('...and it is untouched', (await count("SELECT count(*) n FROM courses WHERE id = 'co_lumen_found' AND capacity = 12")) === 1);

const memberWrite = await asPrincipal(CAST.lumen.member, '/api/schedule/vex', { fingerprint: 'courses/set-active', context: { courseId: 'co_lumen_found', active: false } });
ok('a member certainly cannot', refused(memberWrite) || (await count("SELECT count(*) n FROM courses WHERE id = 'co_lumen_found' AND active")) === 1);

const foreign = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/join-course', context: { courseId: 'co_lumen_found' } });
ok('another studio’s member cannot join this block', refused(foreign), JSON.stringify(foreign).slice(0, 90));
ok('...and no row crossed', (await count("SELECT count(*) n FROM enrolments WHERE course_id = 'co_lumen_found' AND studio_id <> 'st_lumen'")) === 0);

void member;

// ── the desk, at the counter ─────────────────────────────────
const desk = await login(CAST.lumen.desk);
await settle(10);
desk.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(10);
desk.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_sofia' } });
await settle(16);
let deskTree = treeOf(desk);
ok('the desk sees courses on a member record', deskTree.includes('Blocks this person is on'));
ok('...and is offered the open ones', deskTree.includes('Put them on'));

const sofiaBefore = await count("SELECT count(*) n FROM enrolments WHERE person_id = 'p_sofia' AND status = 'enrolled'");
desk.dispatch({ type: 'ui:click', ref: 'enrol', payload: { course_id: 'co_lumen_found' } });
await settle(18);
ok('a desk can enrol somebody at the counter', (await count("SELECT count(*) n FROM enrolments WHERE person_id = 'p_sofia' AND status = 'enrolled'")) === sofiaBefore + 1);

ok('...with the studio stamped by the engine, not the caller', (await count("SELECT count(*) n FROM enrolments e WHERE e.person_id = 'p_sofia' AND e.studio_id = 'st_lumen'")) >= 1, 'the write named a course and a person; the tenant came from scope');
ok('...and the block booked for them', (await count("SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND b.person_id = 'p_sofia'")) > 0);
ok('...and it shows on the record', treeOf(desk).includes('Foundations — autumn block'));

desk.dispatch({ type: 'ui:click', ref: 'withdraw', payload: { enrolment_id: (await runtime.db.query<{ id: string }>("SELECT id FROM enrolments WHERE person_id = 'p_sofia' AND status = 'enrolled' LIMIT 1")).rows[0]?.id } });
await settle(18);
ok('...and take them off again', (await count("SELECT count(*) n FROM enrolments WHERE person_id = 'p_sofia' AND status = 'withdrawn'")) === 1);

const dup = await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'enrolments/create', context: { courseId: 'co_lumen_found', personId: 'p_jonas' } });
ok('enrolling somebody already on a block is refused', refused(dup), JSON.stringify(dup).slice(0, 80));

const rejoin = await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'enrolments/create', context: { courseId: 'co_lumen_found', personId: 'p_sofia' } });
ok('...but somebody who withdrew can be put back', !refused(rejoin), JSON.stringify(rejoin).slice(0, 80));
ok('...reusing the row rather than duplicating it', (await count("SELECT count(*) n FROM enrolments WHERE person_id = 'p_sofia' AND course_id = 'co_lumen_found'")) === 1);
ok('...and re-booking the block', (await count("SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id JOIN class_templates ct ON ct.id = cs.template_id WHERE ct.course_id = 'co_lumen_found' AND b.person_id = 'p_sofia' AND b.status = 'booked' AND cs.held_on >= studio_today('st_lumen')")) > 0);

report('a program is a stream, a course is a block: bounded, capped, and joined once.');
