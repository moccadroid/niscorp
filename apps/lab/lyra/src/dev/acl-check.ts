// Run: pnpm --filter lyra exec tsx src/dev/acl-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { audienceOf } from '@lyra/server/identity';
import { CAST } from '@lyra/db/seed';
import { app, asPrincipal, idFor, idsFor, login, ok, report, runtime, server, sessionFor, settle, treeOf } from './world';

const INSTRUCTOR = CAST.lumen.instructor;
const OWNER = CAST.lumen.owner;

const roleOf = async (staffId: string): Promise<string> => {
  const result = await runtime.db.query<{ role: string }>('SELECT role FROM staff WHERE id = $1', [staffId]);
  return String(result.rows[0]?.role ?? '');
};

const revenueFor = async (email: string): Promise<string> =>
  JSON.stringify(await asPrincipal(email, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} }));

const TAKINGS = await revenueFor(OWNER);

// ── before ──
ok('Tobias is an instructor', (await roleOf('sf_tobias')) === 'instructor');
ok('...and holds no overview', !(await idsFor(INSTRUCTOR)).includes('home.overview'));
ok('...and cannot touch the timetable', !(await idsFor(INSTRUCTOR)).includes('timetable.list'));

const tobiasSession = await sessionFor(INSTRUCTOR);
await settle();
ok('...and his screen shows no revenue', !treeOf(tobiasSession.shell).toLowerCase().includes('expected monthly'));

const revenueBefore = await revenueFor(INSTRUCTOR);
ok('...and the engine does not give him the takings', revenueBefore !== TAKINGS, `${revenueBefore} against the studio's ${TAKINGS}`);

// ── the owner promotes him, through the real screen ──
const owner = await login(OWNER);
await settle();
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'staff.list' });
await settle();
let ownerTree = treeOf(owner);
ok('an owner reaches the staff screen', ownerTree.includes('Who works here'));
ok('...listing the people and their roles', ownerTree.includes('Tobias Reiner') && ownerTree.includes('Instructor'));

owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_tobias', person_id: 'p_tobias', role: 'manager' } });
await settle(4);
ok('...and a confirmation asks first', treeOf(owner).includes('Change their role?'), 'the question must be ON SCREEN, not merely staged');
owner.dispatch({ type: 'ui:click', ref: 'confirm' });
await settle(18);

ok('the role was written', (await roleOf('sf_tobias')) === 'manager');

ok('moss re-resolved the charter for him', (await idsFor(INSTRUCTOR)).includes('home.overview'), 'assignments rebuilt, memos dropped');
ok('...so he now holds the timetable too', (await idsFor(INSTRUCTOR)).includes('timetable.list'));

await settle(10);
const after = treeOf(tobiasSession.shell);
ok('his OPEN shell adopted the new application', after.toLowerCase().includes('expected monthly'), 'no reload, no sign-out');
ok('...and the nav grew the surfaces he now holds', after.includes('Classes') || after.includes('Staff'));

const revenueAfter = await revenueFor(INSTRUCTOR);
ok('...and the engine now gives him the studio figure', revenueAfter === TAKINGS, revenueAfter);

// ── it goes back down, too ──
owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_tobias', person_id: 'p_tobias', role: 'desk' } });
await settle(4);
ok('...and a confirmation asks first', treeOf(owner).includes('Change their role?'), 'the question must be ON SCREEN, not merely staged');
owner.dispatch({ type: 'ui:click', ref: 'confirm' });
await settle(18);
ok('demotion is the same gesture', (await roleOf('sf_tobias')) === 'desk');
ok('...and takes the overview away again', !(await idsFor(INSTRUCTOR)).includes('home.overview'));
const revenueDemoted = await revenueFor(INSTRUCTOR);
ok('...and the engine takes the studio figure back', revenueDemoted !== TAKINGS, `${revenueDemoted} against the studio's ${TAKINGS}`);

// ── saying no — the half that makes the question worth asking ──
owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_tobias', person_id: 'p_tobias', role: 'owner' } });
await settle(4);
ok('an accidental Owner asks first', treeOf(owner).includes('Change their role?'));
owner.dispatch({ type: 'ui:click', ref: 'cancel' });
await settle(10);
ok('...and saying no writes nothing', (await roleOf('sf_tobias')) === 'desk', 'a mistap must be recoverable');
ok('...and takes the question away with it', !treeOf(owner).includes('Change their role?'));

// ── what the screen CANNOT do ──
let refusedByColumn = false;
try {
  await runtime.db.query("UPDATE staff SET role = 'superuser' WHERE id = 'sf_tobias'");
} catch {
  refusedByColumn = true;
}
ok('the column refuses a role the charter never defined', refusedByColumn, 'the comment listing four roles is a CHECK constraint now');


ok('an unrecognised role becomes a member, never an administrator', audienceOf('superuser') === 'member', 'the direction that matters when the word arrives from somewhere nobody reviewed');
ok('...while every role the column allows keeps its own rung', ['owner', 'manager', 'instructor', 'desk', 'automation'].every((r) => audienceOf(r) === r));

const memberIds = await idsFor(CAST.lumen.member);
ok('...and that rung is a working application', memberIds.length > 0, `${memberIds.length} actions`);
ok('...with no staff surface on it', !memberIds.includes('desk.checkin') && !memberIds.includes('staff.list') && !memberIds.includes('reports.overview'));

// PUT HIM BACK, and let the engine notice. There is no assignment map to
// rebuild any more: roles are resolved per principal from rows, so forgetting
// the held record is the whole of what a role change requires. This used to be
// three lines of the check re-deriving the world by hand — and the way that
// went wrong was silent.
await runtime.db.query("UPDATE staff SET role = 'instructor' WHERE id = 'sf_tobias'");
server.invalidateIdentity(idFor(INSTRUCTOR));
server.refresh();

// ── hiring ──
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
ok('...and keeps their subscription', (await runtime.db.query("SELECT 1 FROM subscriptions s JOIN people p ON p.id = s.person_id WHERE p.email = 'ava.klein@example.com' AND s.status = 'active'")).rows.length === 1);
ok('...while gaining a staff row', (await runtime.db.query("SELECT 1 FROM staff s JOIN people p ON p.id = s.person_id WHERE p.email = 'ava.klein@example.com'")).rows.length === 1);

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

const before = await roleOf('sf_ines');
owner.dispatch({ type: 'ui:click', ref: 'role', payload: { staff_id: 'sf_ines', person_id: 'p_ines', role: 'owner' } });
await settle(10);
ok('a role tap does not write', (await roleOf('sf_ines')) === before, 'it stages the change and asks');
ok('...it asks, beside that row and no other', treeOf(owner).includes('Change their role?'), 'a question at the top of a long list is a question nobody sees');
owner.dispatch({ type: 'ui:click', ref: 'cancelRole' });
await settle(8);
ok('...and cancelling leaves them alone', (await roleOf('sf_ines')) === before);

ok('the automation principal is not on the roster', !treeOf(owner).includes('Lumen automations'), 'a mis-tap could have made a nightly job an owner');

report('a role is a row: writing it re-resolves the charter and the open shell adopts.');
