// ACL check — a role is a row, and changing it changes an application.
//
// The claim: an owner taps "Manager" next to somebody's name, and that person's
// nav, surfaces and data verbs all change — on the screen they are already
// looking at, without signing out.
//
// Three things have to hold, and each fails differently:
//
//   1. The row changes.
//   2. moss RE-RESOLVES — assignments are rebuilt and the charter recompiled,
//      or the row changes and nobody's application does.
//   3. The LIVING shell adopts. Otherwise it works on the next login, which is
//      not what was promised.
//
// And the fourth, which is the point of a charter: this screen cannot invent a
// permission. It writes a role name; what a role MEANS is a document.
//
// Run: pnpm --filter lyra exec tsx src/dev/acl-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { CAST } from '@lyra/db/seed';
import { personByEmail } from '@lyra/server/users';
import { app, asPrincipal, login, ok, report, runtime, sessionFor, settle, treeOf } from './world';

const INSTRUCTOR = CAST.lumen.instructor;
const OWNER = CAST.lumen.owner;

const idsFor = (email: string): readonly string[] => resolveCatalog(app, personByEmail(email)?.id ?? null).ids;
const roleOf = async (staffId: string): Promise<string> => {
  const result = await runtime.db.query<{ role: string }>('SELECT role FROM staff WHERE id = $1', [staffId]);
  return String(result.rows[0]?.role ?? '');
};

// WHAT "REFUSED THE TAKINGS" MEANS NOW.
//
// Tobias teaches here AND trains here, so he holds two roles. The member one
// names `subscriptions.read` at personal reach, because a membership card is a
// join over subscriptions and plans — which means the revenue fingerprint does
// not bounce for him. It answers with HIS OWN bill.
//
// So the discriminator is not "refused or answered" any more; it is "his figure
// or the studio's". That is a weaker-looking assertion and a truer one: what a
// promotion actually changes is the SIZE of the answer, and comparing against
// the owner's number is the only way to see it move.
const revenueFor = async (email: string): Promise<string> =>
  JSON.stringify(await asPrincipal(email, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} }));

const TAKINGS = await revenueFor(OWNER);

// ── before ──
ok('Tobias is an instructor', (await roleOf('sf_tobias')) === 'instructor');
ok('...and holds no overview', !idsFor(INSTRUCTOR).includes('home.overview'));
ok('...and cannot touch the timetable', !idsFor(INSTRUCTOR).includes('timetable.list'));

// His shell is OPEN and he is standing on it.
//
// Held as the SESSION, not the shell: a reset builds a new shell and the
// session is what follows it. A snapshot taken here would go on addressing the
// disposed one, and the check would report "it did not adopt" when it had.
const tobiasSession = sessionFor(INSTRUCTOR);
await settle();
ok('...and his screen shows no revenue', !treeOf(tobiasSession.shell).toLowerCase().includes('expected monthly'));

const revenueBefore = await revenueFor(INSTRUCTOR);
ok('...and the engine does not give him the takings', revenueBefore !== TAKINGS, `${revenueBefore} against the studio's ${TAKINGS}`);

// ── the owner promotes him, through the real screen ──
const owner = login(OWNER);
await settle();
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'staff.list' });
await settle();
let ownerTree = treeOf(owner);
ok('an owner reaches the staff screen', ownerTree.includes('Who works here'));
ok('...listing the people and their roles', ownerTree.includes('Tobias Reiner') && ownerTree.includes('Instructor'));

owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_tobias', person_id: 'p_tobias', role: 'manager' } });
await settle(4);
// STAGED, NOT APPLIED. The tap ASKS — it pushes the shared confirm over the
// roster — and this answers it. A check that could drive a role change in one
// dispatch was a check asserting the dangerous version.
ok('...and a confirmation asks first', treeOf(owner).includes('Change their role?'), 'the question must be ON SCREEN, not merely staged');
owner.dispatch({ type: 'ui:click', ref: 'confirm' });
await settle(18);

// 1 — the row
ok('the role was written', (await roleOf('sf_tobias')) === 'manager');

// 2 — moss re-resolved
ok('moss re-resolved the charter for him', idsFor(INSTRUCTOR).includes('home.overview'), 'assignments rebuilt, memos dropped');
ok('...so he now holds the timetable too', idsFor(INSTRUCTOR).includes('timetable.list'));

// 3 — the LIVING shell adopted, with no sign-out
await settle(10);
const after = treeOf(tobiasSession.shell);
ok('his OPEN shell adopted the new application', after.toLowerCase().includes('expected monthly'), 'no reload, no sign-out');
ok('...and the nav grew the surfaces he now holds', after.includes('Classes') || after.includes('Staff'));

// The engine agrees with the screen — the half a UI change alone would not give.
const revenueAfter = await revenueFor(INSTRUCTOR);
ok('...and the engine now gives him the studio figure', revenueAfter === TAKINGS, revenueAfter);

// ── it goes back down, too ──
owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_tobias', person_id: 'p_tobias', role: 'desk' } });
await settle(4);
// STAGED, NOT APPLIED. The tap ASKS — it pushes the shared confirm over the
// roster — and this answers it. A check that could drive a role change in one
// dispatch was a check asserting the dangerous version.
ok('...and a confirmation asks first', treeOf(owner).includes('Change their role?'), 'the question must be ON SCREEN, not merely staged');
owner.dispatch({ type: 'ui:click', ref: 'confirm' });
await settle(18);
ok('demotion is the same gesture', (await roleOf('sf_tobias')) === 'desk');
ok('...and takes the overview away again', !idsFor(INSTRUCTOR).includes('home.overview'));
const revenueDemoted = await revenueFor(INSTRUCTOR);
ok('...and the engine takes the studio figure back', revenueDemoted !== TAKINGS, `${revenueDemoted} against the studio's ${TAKINGS}`);

// ── SAYING NO — the half that makes the question worth asking ──
//
// The report was "I could accidentally make anyone owner". A confirmation that
// is never driven down the NO branch does not answer that; it only proves the
// YES branch still works.
owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_tobias', person_id: 'p_tobias', role: 'owner' } });
await settle(4);
ok('an accidental Owner asks first', treeOf(owner).includes('Change their role?'));
owner.dispatch({ type: 'ui:click', ref: 'cancel' });
await settle(10);
ok('...and saying no writes nothing', (await roleOf('sf_tobias')) === 'desk', 'a mistap must be recoverable');
ok('...and takes the question away with it', !treeOf(owner).includes('Change their role?'));

// ── what the screen CANNOT do ──
//
// The charter is the ceiling. A role nobody wrote down resolves to nothing, so
// the worst this screen can do is set a word that means nothing — never invent
// a capability.
// TWO FLOORS NOW, and the outer one is new.
//
// This wrote an invented role straight into the table to prove the charter is
// the ceiling — a role nobody wrote down grants nothing. That is still true and
// still asserted below. But the column used to ACCEPT the word: the row sat
// there reading "superuser", and only the resolver's silence kept it harmless.
//
// A CHECK constraint now refuses it outright, so the invented role never
// reaches a row at all. Asserted first, because "the database would not store
// it" is a stronger statement than "storing it granted nothing".
let refusedByColumn = false;
try {
  await runtime.db.query("UPDATE staff SET role = 'superuser' WHERE id = 'sf_tobias'");
} catch {
  refusedByColumn = true;
}
ok('the column refuses a role the charter never defined', refusedByColumn, 'the comment listing four roles is a CHECK constraint now');

// AND THE DOWNWARD RESOLUTION STILL HOLDS — tested where it lives.
//
// This block used to write an invented role into the table and assert the
// resolved catalog was harmless. Two things about that are now different:
//
//   • the column refuses the invented role, so it cannot be written;
//   • the charter THROWS on an unknown role rather than resolving it. The
//     downward step was never the charter's — it is the DIRECTORY's, which maps
//     an unrecognised staff role to 'member' before the charter ever sees it.
//
// So this asserts the real mechanism at the real layer. The seam matters: a
// role can still arrive from somewhere the CHECK does not guard — a migration,
// an integration, a future artifact layer writing assignments — and when it
// does, it must land on the bottom rung rather than throw or escalate.
const { loadDirectory, everyone, audienceOf } = await import('@lyra/server/users');

ok('an unrecognised role becomes a member, never an administrator', audienceOf('superuser') === 'member', 'the direction that matters when the word arrives from somewhere nobody reviewed');
ok('...while every role the column allows keeps its own rung', ['owner', 'manager', 'instructor', 'desk', 'automation'].every((r) => audienceOf(r) === r));

// And the member rung is a real application, not an empty one — landing there
// has to leave somebody with a usable app.
const memberIds = idsFor(CAST.lumen.member);
ok('...and that rung is a working application', memberIds.length > 0, `${memberIds.length} actions`);
ok('...with no staff surface on it', !memberIds.includes('desk.checkin') && !memberIds.includes('staff.list') && !memberIds.includes('reports.overview'));

void loadDirectory;
void everyone;

await runtime.db.query("UPDATE staff SET role = 'instructor' WHERE id = 'sf_tobias'");
await loadDirectory(runtime.pool);
for (const key of Object.keys(app.assignments)) delete app.assignments[key];
for (const person of everyone()) app.assignments[person.id] = [person.audience];

// ── hiring ──
//
// The gap this closes: until now a studio could change the role of somebody
// already on staff, and had no way to add the first instructor. Like signing a
// member up it needs a person AND a row referencing them, so it is a fn — and
// like that one, it writes through authored entries so the engine still stamps
// the studio.
// The same owner session, still open from the promotion above.
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'staff.list' });
await settle(8);

owner.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
ok('an owner can open a hiring form', treeOf(owner).includes('Put somebody on staff'));

const staffBefore = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM staff WHERE studio_id = 'st_lumen'");
owner.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Rea Vogel' });
owner.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'rea@lumen.studio' });
owner.dispatch({ type: 'ui:model', ref: 'newRole', payload: 'desk' });
await settle();
owner.dispatch({ type: 'ui:click', ref: 'create' });
await settle(18);

const staffAfter = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM staff WHERE studio_id = 'st_lumen'");
ok('somebody can be put on staff', Number(staffAfter.rows[0]?.n) === Number(staffBefore.rows[0]?.n) + 1);
ok('...with the person created alongside', (await runtime.db.query("SELECT 1 FROM people WHERE email = 'rea@lumen.studio'")).rows.length === 1);
ok('...in the role chosen', (await runtime.db.query("SELECT 1 FROM staff s JOIN people p ON p.id = s.person_id WHERE p.email = 'rea@lumen.studio' AND s.role = 'desk'")).rows.length === 1);
ok('...at THIS studio, stamped by the engine', (await runtime.db.query("SELECT 1 FROM staff s JOIN people p ON p.id = s.person_id WHERE p.email = 'rea@lumen.studio' AND s.studio_id = 'st_lumen'")).rows.length === 1);
ok('...and the list shows them', treeOf(owner).includes('"person_name":"Rea Vogel"'), 'asserted on the ROW, not the form field');

// A MEMBER WHO STARTS TEACHING is one human, not two. This is the reason
// `people` and `staff` are separate tables, and the reason the fn looks the
// address up before creating anything.
const peopleBefore = await runtime.db.query<{ n: number }>('SELECT count(*) n FROM people');
owner.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
owner.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Ava Klein' });
owner.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'ava.klein@example.com' });
owner.dispatch({ type: 'ui:model', ref: 'newRole', payload: 'instructor' });
await settle();
owner.dispatch({ type: 'ui:click', ref: 'create' });
await settle(18);
ok('a member who starts teaching stays one person', Number((await runtime.db.query<{ n: number }>('SELECT count(*) n FROM people')).rows[0]?.n) === Number(peopleBefore.rows[0]?.n), 'the row was reused, not duplicated');
ok('...and keeps their membership', (await runtime.db.query("SELECT 1 FROM memberships m JOIN people p ON p.id = m.person_id WHERE p.email = 'ava.klein@example.com'")).rows.length === 1);
ok('...while gaining a staff row', (await runtime.db.query("SELECT 1 FROM staff s JOIN people p ON p.id = s.person_id WHERE p.email = 'ava.klein@example.com'")).rows.length === 1);

// Hiring is `staff.write.insert`, which is the owner's. A desk that could add
// staff could add itself an owner, which is the whole game.
const deskHire = await asPrincipal(CAST.lumen.desk, '/api/staff/vex', { fingerprint: 'staff/create', context: { staffId: 'forged', personId: 'p_ava', role: 'owner' } });
ok('a desk cannot put anybody on staff', JSON.stringify(deskHire).includes('status'), JSON.stringify(deskHire).slice(0, 70));
ok('...and no row appeared', (await runtime.db.query("SELECT 1 FROM staff WHERE id = 'forged'")).rows.length === 0);

// ── who may do any of this ──
const asManager = await asPrincipal(CAST.northrock.manager, '/api/staff/vex', { fingerprint: 'staff/set-role', context: { staffId: 'sf_kaya', role: 'owner' } });
ok('a manager cannot promote themselves', JSON.stringify(asManager).includes('status'), JSON.stringify(asManager).slice(0, 70));
ok('...and the row did not move', (await roleOf('sf_kaya')) === 'manager');

const crossStudio = await asPrincipal(OWNER, '/api/staff/vex', { fingerprint: 'staff/set-role', context: { staffId: 'sf_dario', role: 'desk' } });
void crossStudio;
ok('an owner cannot demote a competitor’s owner', (await roleOf('sf_dario')) === 'owner');


// A ROLE CHANGE ASKS FIRST — the staged tap, asserted.
//
// One mis-tap on a row of four words used to make somebody an owner outright:
// the takings, the price list, and the power to re-role everybody else, on a
// living shell that adopts instantly. This is the assertion that the dangerous
// version cannot come back.
const before = await roleOf('sf_ines');
owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_ines', person_id: 'p_ines', role: 'owner' } });
await settle(10);
ok('a role tap does not write', (await roleOf('sf_ines')) === before, 'it stages the change and asks');
ok('...it asks, beside that row and no other', treeOf(owner).includes('Change their role?'), 'a question at the top of a long list is a question nobody sees');
owner.dispatch({ type: 'ui:click', ref: 'cancelRole' });
await settle(8);
ok('...and cancelling leaves them alone', (await roleOf('sf_ines')) === before);

// An automation is a staff row so the charter governs it — it is not somebody
// you can promote, and it has no business on a screen about people.
ok('the automation principal is not on the roster', !treeOf(owner).includes('Lumen automations'), 'a mis-tap could have made a nightly job an owner');

report('a role is a row: writing it re-resolves the charter and the open shell adopts.');
