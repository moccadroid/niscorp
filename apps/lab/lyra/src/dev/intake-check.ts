// Intake check — signing somebody up, and the reports that move when you do.
//
// The sign-up is the one write in this application that goes through a `fn:`,
// and the point of this check is that using the escape hatch cost nothing:
// the statements are still authored, still replay-only, and the ENGINE still
// stamps the studio. A fn that opened the database directly would pass the
// first half of this check and fail the second.
//
// Run: pnpm --filter lyra exec tsx src/dev/intake-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

const desk = login(CAST.lumen.desk);
await settle();

// ── the form ──
desk.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle();
ok('the desk reaches the roll', treeOf(desk).includes('Members'));

desk.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
ok('there is a sign-up screen', treeOf(desk).includes('Name and email are all we need'));

// IN THE SHEET, OVER THE ROLL — which is the layout overhaul showing up in a
// check written before it.
//
// It used to push onto `main`, so filling in a name replaced the list you were
// reading. A form is not a place you go; it is something you do to what is
// already on screen. The roll STAYING is the assertion now, and it changed
// because the push names a different canvas — the action itself is untouched.
ok('...over the roll, which stays put', treeOf(desk).includes('ava.klein@example.com'), 'a form is not a place you navigate to');

// THE ACTION DRAWS NO WAY OUT, and that is the assertion now.
//
// It used to take a `returnable` input and render a Back button when something
// had pushed it — an action reading its own context, and two escapes on screen
// once the sheet grew a close control. Navigation belongs to the shell: the
// sheet fragment supplies dismissal, and a kiosk mounting this bare has nothing
// to dismiss to, which is correct.
ok('...and draws no navigation of its own', !treeOf(desk).includes('← Back'), 'an action that knows it was pushed is an action that cannot be mounted bare');

// ── signing somebody up ──
const peopleBefore = await count('SELECT count(*) n FROM people');
desk.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Ida Brenner' });
desk.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'ida.brenner@example.com' });
desk.dispatch({ type: 'ui:model', ref: 'newPhone', payload: '+43 660 9999' });
await settle();
desk.dispatch({ type: 'ui:click', ref: 'create' });
await settle(16);

ok('a person was created', (await count('SELECT count(*) n FROM people')) === peopleBefore + 1);
ok('...with a membership linked to them', (await count("SELECT count(*) n FROM memberships m JOIN people p ON p.id = m.person_id WHERE p.email = 'ida.brenner@example.com'")) === 1);

// THE HALF THAT MATTERS: the fn minted an id and replayed two authored
// mutations. It never touched the database, so the engine stamped the studio.
ok('the ENGINE stamped the studio, not the function', (await count("SELECT count(*) n FROM memberships m JOIN people p ON p.id = m.person_id WHERE p.email = 'ida.brenner@example.com' AND m.studio_id = 'st_lumen'")) === 1);
ok('...and the database dated the join', (await count("SELECT count(*) n FROM memberships m JOIN people p ON p.id = m.person_id WHERE p.email = 'ida.brenner@example.com' AND m.joined_on = studio_today('st_lumen')")) === 1);
ok('...starting on trial, as the form said', (await count("SELECT count(*) n FROM memberships m JOIN people p ON p.id = m.person_id WHERE p.email = 'ida.brenner@example.com' AND m.status = 'trialling'")) === 1);

// The confirmation, which is what a kiosk stays on and a desk reads before
// going back. It names the person, so the fields have to be captured before
// they are cleared.
let tree = treeOf(desk);
ok('it confirms by name', tree.includes('"title":"Ida Brenner"'), 'the heading, not a leftover field value');
ok('...and offers the next sign-up', tree.includes('Sign somebody else up'));
ok('...with the form cleared behind it', !tree.includes('Name and email are all we need'));

// Dismissed the way the shell dismisses it — the fragment's ref, not a button
// the action drew.
desk.dispatch({ type: 'ui:click', ref: 'sheetClose' });
await settle(8);
tree = treeOf(desk);
ok('back returns to the roll', tree.includes('ava.klein@example.com'));
ok('...and the roll shows the new member', tree.includes('"person_name":"Ida Brenner"'), 'asserted on the ROW — a bare name match would find the form field value');

// ── an address we already know ──
//
// People and memberships are separate tables precisely so a returning member
// reuses the human. Signing up an existing address must not make a second one.
const peopleNow = await count('SELECT count(*) n FROM people');
desk.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
desk.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Felix Baum' });
desk.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'felix.baum@example.com' });
await settle();
desk.dispatch({ type: 'ui:click', ref: 'create' });
await settle(16);
ok('a known address does not create a second person', (await count('SELECT count(*) n FROM people')) === peopleNow, 'the human is reused');

// Felix already HAS a membership at Lumen, so the second one violates the
// unique constraint — and the desk is told rather than left guessing.
ok('...and a duplicate membership is refused', (await count("SELECT count(*) n FROM memberships m JOIN people p ON p.id = m.person_id WHERE p.email = 'felix.baum@example.com'")) === 1);
ok('...with the form still open, not confirmed', treeOf(desk).includes('Name and email are all we need'), 'a refusal must not look like a success');
ok('...and the reason on screen', treeOf(desk).includes('"tone":"alert"'), 'the desk is told, not left guessing');

// ── who may sign somebody up ──
const asMember = await asPrincipal(CAST.lumen.member, '/api/member/vex', {
  fingerprint: 'memberships/create',
  context: { membershipId: 'x', personId: 'p_ava', status: 'active', notes: '' },
});
ok('a member cannot sign people up', JSON.stringify(asMember).includes('status'), JSON.stringify(asMember).slice(0, 70));

// ── the reports moved ──
const owner = login(CAST.lumen.owner);
await settle();
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'reports.overview' });
await settle(14);
const reportTree = treeOf(owner);
ok('an owner reaches the reports', reportTree.includes('Where the week actually goes'));
ok('...with peak hours grouped on the denormalised bucket', reportTree.includes('hour_display'), 'no date functions needed');
ok('...and attendance by program', reportTree.includes('Vinyasa Flow'));
ok('...and the roll broken down by status', reportTree.includes('trialling') || reportTree.includes('active'));
ok('...and plan uptake with prices', reportTree.includes('price_display'));

// Reports are manager-and-up: they read `subscriptions`, which is the grant
// separating what a studio sells from what it earns.
const deskReports = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', { fingerprint: 'reports/plan-uptake', context: {} });
ok('the desk cannot read plan uptake', JSON.stringify(deskReports).includes('status'), JSON.stringify(deskReports).slice(0, 70));

const foreign = await asPrincipal(CAST.northrock.owner, '/api/schedule/vex', { fingerprint: 'reports/attendance-by-hour', context: { from: '2000-01-01', to: '2100-01-01' } });
const lumenHours = await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', { fingerprint: 'reports/attendance-by-hour', context: { from: '2000-01-01', to: '2100-01-01' } });
ok('every studio gets its own figures', JSON.stringify(foreign) !== JSON.stringify(lumenHours), 'grouped reads are scoped like every other read');

// ── AN ENQUIRY IS THE SAME ROW, ONE STATUS EARLIER ──────────
//
// The old shape put a prospect in a `leads` table with their own name, email
// and phone, and "Sign up" pushed the intake form with input keys the form did
// not have — so it opened BLANK, the desk retyped the person, and a SECOND
// human record was created with no link back to the enquiry. This asserts the
// property that replaced it: converting writes no person and creates no row.
const beforePeople = Number((await runtime.db.query<{ n: number }>('SELECT count(*)::int n FROM people')).rows[0]?.n ?? 0);
const beforeRows = Number((await runtime.db.query<{ n: number }>('SELECT count(*)::int n FROM memberships')).rows[0]?.n ?? 0);

const enquiry = await runtime.db.query<{ id: string; person_id: string }>(
  `SELECT id, person_id FROM memberships WHERE status = 'enquired' AND studio_id = 'st_lumen' LIMIT 1`,
);
const enquiryId = enquiry.rows[0]?.id ?? '';
const enquiryPerson = enquiry.rows[0]?.person_id ?? '';
ok('an enquiry is a membership', enquiryId !== '', `${enquiryId.slice(0, 8)}… — a person the studio already knows`);

const front = login(CAST.lumen.desk);
await settle();
front.dispatch({ type: 'ui:click', ref: 'nav', payload: 'leads.list' });
await settle(14);
ok('the desk reaches the enquiries', treeOf(front).includes('Priya Anand'), 'people, not shadow rows');

front.dispatch({ type: 'ui:click', ref: 'convert', payload: { lead_id: enquiryId } });
await settle(16);

const afterPeople = Number((await runtime.db.query<{ n: number }>('SELECT count(*)::int n FROM people')).rows[0]?.n ?? 0);
const afterRows = Number((await runtime.db.query<{ n: number }>('SELECT count(*)::int n FROM memberships')).rows[0]?.n ?? 0);
const converted = await runtime.db.query<{ status: string; person_id: string; source: string }>('SELECT status, person_id, source FROM memberships WHERE id = $1', [enquiryId]);

ok('joining is a status change', converted.rows[0]?.status === 'active', String(converted.rows[0]?.status));
ok('...creating NO new person', afterPeople === beforePeople, `${beforePeople} before, ${afterPeople} after`);
ok('...and NO new membership', afterRows === beforeRows, `${beforeRows} before, ${afterRows} after`);
ok('...on the same human who asked', converted.rows[0]?.person_id === enquiryPerson, 'the enquiry stays attached to them forever');
ok('...and where they came from survives', String(converted.rows[0]?.source ?? '') !== '', `source: ${String(converted.rows[0]?.source)} — the question the dead column existed for`);

report('a desk can sign somebody up, an enquiry becomes a member without being retyped, and the engine still owns tenancy.');
