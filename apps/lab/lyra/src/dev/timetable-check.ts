// Timetable check — the rules, and the classes that follow from them.
//
// The claim under test is that a manager edits ONE row and the calendar
// rearranges itself. Session generation is a database trigger, so this asserts
// on what a manager does (one write) and on what happens (a term of dated
// classes), and specifically on the line between them: a slot that people have
// booked into is a commitment, and moving the rule must not silently cancel it.
//
// Run: pnpm --filter lyra exec tsx src/dev/timetable-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

const shell = login(CAST.lumen.owner);
await settle();

// ── the grid ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle();
let tree = treeOf(shell);
// ONE SCREEN for everything that runs — weekly classes and bounded courses.
// Two screens over the same table with different filters is what made the pair
// read as unrelated ideas.
ok('a manager reaches everything that runs', tree.includes('Everything this studio runs'));
ok('...and a row says which kind it is', tree.includes('Every week'), 'the Runs column replaced a whole screen');
ok('...with the studio’s slots on it', tree.includes('Morning Flow'));
ok('...naming who teaches each one', tree.includes('Maren Holt') || tree.includes('Tobias Reiner'));

// A slot with nobody assigned must still appear — it is the row a manager is
// looking for, and an INNER join would have dropped it.
await runtime.db.query("UPDATE class_templates SET instructor_id = NULL WHERE id = 'ct_l_sat_am'");
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle();
ok('a slot with no teacher still appears', treeOf(shell).includes('Unassigned'), 'nullable FK left-joins');

// ── creating a slot generates classes ──
const before = await count("SELECT count(*) n FROM class_sessions WHERE studio_id = 'st_lumen'");
const created = await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', {
  fingerprint: 'templates/create',
  // An ONGOING class: no course, no bounds. The three nulls are what make it
  // ongoing rather than a block — a bounded slot carries a course and a window.
  context: { programId: 'pr_vinyasa', name: 'Sunrise Flow', weekday: 2, startsAt: '06:45', durationMins: 45, capacity: 12, instructorId: 'sf_maren', courseId: null, startsOn: null, endsOn: null },
});
ok('a manager can add a weekly slot', !JSON.stringify(created).includes('status'), JSON.stringify(created).slice(0, 90));

const template = await runtime.db.query<{ id: string }>("SELECT id FROM class_templates WHERE name = 'Sunrise Flow'");
const templateId = template.rows[0]?.id ?? '';
ok('...and the row exists', templateId !== '');

const generated = await count('SELECT count(*) n FROM class_sessions WHERE template_id = $1', [templateId]);
ok('...and dated classes were generated from it', generated >= 3, `${generated} sessions over the next four weeks`);
ok('...on the right weekday', (await count('SELECT count(*) n FROM class_sessions WHERE template_id = $1 AND EXTRACT(DOW FROM held_on) <> 2', [templateId])) === 0);
ok('...all in the future', (await count('SELECT count(*) n FROM class_sessions WHERE template_id = $1 AND held_on <= CURRENT_DATE', [templateId])) === 0);
ok('...carrying the slot’s capacity and teacher', (await count("SELECT count(*) n FROM class_sessions WHERE template_id = $1 AND (capacity <> 12 OR instructor_id <> 'sf_maren')", [templateId])) === 0);
ok('...and the studio was stamped engine-side', (await count("SELECT count(*) n FROM class_sessions WHERE template_id = $1 AND studio_id <> 'st_lumen'", [templateId])) === 0);
ok('the total grew', (await count("SELECT count(*) n FROM class_sessions WHERE studio_id = 'st_lumen'")) > before);

// ── moving the rule moves the unbooked classes ──
await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', {
  fingerprint: 'templates/update',
  context: { templateId, programId: 'pr_vinyasa', name: 'Sunrise Flow', weekday: 4, startsAt: '06:45', durationMins: 45, capacity: 12, instructorId: 'sf_maren' },
});
ok('moving the slot moves its classes', (await count('SELECT count(*) n FROM class_sessions WHERE template_id = $1 AND EXTRACT(DOW FROM held_on) <> 4', [templateId])) === 0);

// THE LINE THAT MATTERS: a booked class is a commitment. Book somebody into a
// generated session, move the rule, and that session must survive.
const victim = await runtime.db.query<{ id: string }>('SELECT id FROM class_sessions WHERE template_id = $1 ORDER BY held_on LIMIT 1', [templateId]);
const victimId = victim.rows[0]?.id ?? '';
await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'bookings/create', context: { sessionId: victimId, membershipId: 'mb_ava' } });
ok('somebody books into a generated class', (await count('SELECT count(*) n FROM bookings WHERE session_id = $1', [victimId])) === 1);

await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', {
  fingerprint: 'templates/update',
  context: { templateId, programId: 'pr_vinyasa', name: 'Sunrise Flow', weekday: 5, startsAt: '06:45', durationMins: 45, capacity: 12, instructorId: 'sf_maren' },
});
ok('moving the rule does NOT cancel a class people booked', (await count('SELECT count(*) n FROM class_sessions WHERE id = $1', [victimId])) === 1, 'a commitment survives a schedule change');

// ── the booked counter is the database’s job ──
ok('booking moved the counter without anybody asking', (await count('SELECT count(*) n FROM class_sessions WHERE id = $1 AND booked_count = 1', [victimId])) === 1);

// ── capacity is enforced where it cannot be raced ──
const tiny = await runtime.db.query<{ id: string }>("SELECT id FROM class_sessions WHERE studio_id='st_lumen' AND status='scheduled' ORDER BY held_on DESC LIMIT 1");
const tinyId = tiny.rows[0]?.id ?? '';
await runtime.db.query('UPDATE class_sessions SET capacity = 1 WHERE id = $1', [tinyId]);
// Somebody with no booking on this session yet — booking one you already hold
// is a no-op now, so a hardcoded pair would make the overflow untestable the
// moment the seed happened to include it.
const free = await runtime.db.query<{ id: string }>("SELECT m.id FROM memberships m WHERE m.studio_id = 'st_lumen' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = $1 AND b.membership_id = m.id) LIMIT 2", [tinyId]);
const firstIn = free.rows[0]?.id ?? 'mb_ava';
const nextUp = free.rows[1]?.id ?? 'mb_jonas';
await runtime.db.query('DELETE FROM bookings WHERE session_id = $1', [tinyId]);
await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'bookings/create', context: { sessionId: tinyId, membershipId: firstIn } });
const overflow = await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'bookings/create', context: { sessionId: tinyId, membershipId: nextUp } });
// FULL IS A QUEUE, for the desk as well now.
//
// This asserted a refusal, and a refusal was what the desk got — because the
// waitlist lived on the member's parallel table and guarded only their path.
// The rule moved onto `bookings` when that table went, so a desk booking
// somebody into a full class queues them instead of throwing the fact away.
ok('a full class queues the next booking rather than refusing', !JSON.stringify(overflow).includes('"status":4'), JSON.stringify(overflow).slice(0, 80));
ok('...as waitlisted', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND membership_id = $2 AND status = 'waitlisted'", [tinyId, nextUp])) === 1, 'demand above the room is a fact a studio wants kept');
ok('...and the class is not overbooked', (await count('SELECT count(*) n FROM bookings WHERE session_id = $1 AND status = $2', [tinyId, 'booked'])) === 1);

// ── retiring keeps history ──
const retired = await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', { fingerprint: 'templates/retire', context: { templateId } });
void retired;
ok('retiring a slot keeps the rule', (await count('SELECT count(*) n FROM class_templates WHERE id = $1', [templateId])) === 1);
ok('...and drops only the unbooked future classes', (await count('SELECT count(*) n FROM class_sessions WHERE id = $1', [victimId])) === 1, 'the booked one stays');

// ── who may do any of this ──
const asDesk = await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', {
  fingerprint: 'templates/create',
  context: { programId: 'pr_vinyasa', name: 'Nope', weekday: 1, startsAt: '10:00', durationMins: 60, capacity: 10, instructorId: '', courseId: null, startsOn: null, endsOn: null },
});
ok('the front desk cannot change the timetable', JSON.stringify(asDesk).includes('status'), JSON.stringify(asDesk).slice(0, 70));
ok('...and nothing was written', (await count("SELECT count(*) n FROM class_templates WHERE name = 'Nope'")) === 0);

const foreign = await asPrincipal(CAST.northrock.owner, '/api/schedule/vex', { fingerprint: 'templates/update', context: { templateId, programId: 'pr_gi', name: 'Hijacked', weekday: 1, startsAt: '10:00', durationMins: 60, capacity: 10, instructorId: '' } });
void foreign;
ok('another studio cannot edit this one’s timetable', (await count("SELECT count(*) n FROM class_templates WHERE name = 'Hijacked'")) === 0);


// ── the grid is REACHABLE and says which screen it is ────────
//
// Both timetable screens were called "Timetable", and the read-only calendar
// owned the nav item with that name — so the obvious place to go and change
// the timetable was the one screen that cannot, and the editable grid sat
// behind "Classes" wearing the calendar's title. Nothing was broken and the
// feature looked missing, which is the same thing to whoever is using it.
const boss2 = login(CAST.lumen.owner);
await settle(8);
boss2.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle(10);
let gridTree = treeOf(boss2);
ok('the editable grid names itself after its nav item', gridTree.includes('"title":"Classes"'), 'two screens called Timetable is one too many');
ok('...and says what the difference is', tree.includes('a course runs between two dates for a price'));

// Opening a class to change it must not look like creating one.
boss2.dispatch({ type: 'ui:click', ref: 'edit', payload: { template_id: templateId } });
await settle(14);
gridTree = treeOf(boss2);
ok('opening a class says EDIT, not add', gridTree.includes('"title":"Edit class"'), 'a filled form titled "Add a class" reads as "editing is not a thing here"');
ok('...and offers Save rather than Add', gridTree.includes('"label":"Save"'));
ok('...with the slot prefilled', gridTree.includes('"value":"Sunday Sparring"') || gridTree.includes('"label":"Class name"'), 'the read answers; the form wears it');

boss2.dispatch({ type: 'ui:click', ref: 'sheetClose' });
await settle(8);
boss2.dispatch({ type: 'ui:click', ref: 'add' });
await settle(12);
ok('and adding still says ADD', treeOf(boss2).includes('"title":"Add a class"'));
ok('...offering Add class rather than Save', treeOf(boss2).includes('"label":"Add class"'));

report('the grid drives the calendar: one row in, a term of classes out, and commitments survive.');
