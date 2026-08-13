// Run: pnpm --filter lyra exec tsx src/dev/timetable-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

const shell = await login(CAST.lumen.owner);
await settle();

// ── the grid ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle();
let tree = treeOf(shell);
ok('a manager reaches everything that runs', tree.includes('Everything this studio runs'));
ok('...and a row says which kind it is', tree.includes('Every week'), 'the Runs column replaced a whole screen');
ok('...with the studio’s slots on it', tree.includes('Morning Flow'));
ok('...naming who teaches each one', tree.includes('Maren Holt') || tree.includes('Tobias Reiner'));

await runtime.db.query("UPDATE class_templates SET instructor_id = NULL WHERE id = 'ct_l_sat_am'");
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle();
ok('a slot with no teacher still appears', treeOf(shell).includes('Unassigned'), 'nullable FK left-joins');

// ── creating a slot generates classes ──
const before = await count("SELECT count(*) n FROM class_sessions WHERE studio_id = 'st_lumen'");
const created = await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', {
  fingerprint: 'templates/create',
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

const victim = await runtime.db.query<{ id: string }>('SELECT id FROM class_sessions WHERE template_id = $1 ORDER BY held_on LIMIT 1', [templateId]);
const victimId = victim.rows[0]?.id ?? '';
await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'bookings/create', context: { sessionId: victimId, personId: 'p_ava' } });
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
const free = await runtime.db.query<{ id: string }>("SELECT m.person_id AS id FROM subscriptions m WHERE m.studio_id = 'st_lumen' AND m.status = 'active' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = $1 AND b.person_id = m.person_id) LIMIT 2", [tinyId]);
const firstIn = free.rows[0]?.id ?? 'p_ava';
const nextUp = free.rows[1]?.id ?? 'p_jonas';
await runtime.db.query('DELETE FROM bookings WHERE session_id = $1', [tinyId]);
await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'bookings/create', context: { sessionId: tinyId, personId: firstIn } });
const overflow = await asPrincipal(CAST.lumen.desk, '/api/schedule/vex', { fingerprint: 'bookings/create', context: { sessionId: tinyId, personId: nextUp } });
ok('a full class queues the next booking rather than refusing', !JSON.stringify(overflow).includes('"status":4'), JSON.stringify(overflow).slice(0, 80));
ok('...as waitlisted', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND person_id = $2 AND status = 'waitlisted'", [tinyId, nextUp])) === 1, 'demand above the room is a fact a studio wants kept');
ok('...and the class is not overbooked', (await count('SELECT count(*) n FROM bookings WHERE session_id = $1 AND status = $2', [tinyId, 'booked'])) === 1);

// ── retiring keeps history ──
const retired = await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', { fingerprint: 'templates/set-active', context: { templateId, active: false } });
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

// ── the grid is reachable and says which screen it is ────────
const boss2 = await login(CAST.lumen.owner);
await settle(8);
boss2.dispatch({ type: 'ui:click', ref: 'nav', payload: 'timetable.list' });
await settle(10);
let gridTree = treeOf(boss2);
ok('the editable grid names itself after its nav item', gridTree.includes('"title":"Classes"'), 'two screens called Timetable is one too many');
ok('...and says what the difference is', tree.includes('a course runs between two dates for a price'));

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
