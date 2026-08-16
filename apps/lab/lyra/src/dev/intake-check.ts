// Run: pnpm --filter lyra exec tsx src/dev/intake-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

const desk = await login(CAST.lumen.desk);
await settle();

// ── the form ──
desk.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle();
ok('the desk reaches the roll', treeOf(desk).includes('People'));

desk.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
ok('there is a sign-up screen', treeOf(desk).includes('Name and email are all we need'));

ok('...over the roll, which stays put', treeOf(desk).includes('ava.klein@example.com'), 'a form is not a place you navigate to');

ok('...and draws no navigation of its own', !treeOf(desk).includes('← Back'), 'an action that knows it was pushed is an action that cannot be mounted bare');

// ── writing somebody down ──
const peopleBefore = await count('SELECT count(*) n FROM people');
desk.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Ida Brenner' });
desk.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'ida.brenner@example.com' });
desk.dispatch({ type: 'ui:model', ref: 'newPhone', payload: '+43 660 9999' });
await settle();
desk.dispatch({ type: 'ui:click', ref: 'create' });
await settle(16);

ok('a person was created', (await count('SELECT count(*) n FROM people')) === peopleBefore + 1);
ok('...with an anchor linked to them', (await count("SELECT count(*) n FROM studio_people sp JOIN people p ON p.id = sp.person_id WHERE p.email = 'ida.brenner@example.com'")) === 1);

ok('the ENGINE stamped the studio, not the function', (await count("SELECT count(*) n FROM studio_people sp JOIN people p ON p.id = sp.person_id WHERE p.email = 'ida.brenner@example.com' AND sp.studio_id = 'st_lumen'")) === 1);
ok('...and the database dated the meeting', (await count("SELECT count(*) n FROM studio_people sp JOIN people p ON p.id = sp.person_id WHERE p.email = 'ida.brenner@example.com' AND sp.first_seen_on = studio_today('st_lumen')")) === 1);
ok('...holding NOTHING — what she is derives from what she holds', (await count("SELECT count(*) n FROM subscriptions s JOIN people p ON p.id = s.person_id WHERE p.email = 'ida.brenner@example.com'")) === 0, 'a prospect is an anchor row, not a status');

let tree = treeOf(desk);
ok('it confirms by name', tree.includes('"title":"Ida Brenner"'), 'the heading, not a leftover field value');
ok('...and offers the next sign-up', tree.includes('Sign somebody else up'));
ok('...with the form cleared behind it', !tree.includes('Name and email are all we need'));

desk.dispatch({ type: 'ui:click', ref: 'sheetClose' });
await settle(8);
tree = treeOf(desk);
ok('back returns to the roll', tree.includes('ava.klein@example.com'));

// ── an address we already know ──
const peopleNow = await count('SELECT count(*) n FROM people');
desk.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
desk.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Felix Baum' });
desk.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'felix.baum@example.com' });
await settle();
desk.dispatch({ type: 'ui:click', ref: 'create' });
await settle(16);
ok('a known address does not create a second person', (await count('SELECT count(*) n FROM people')) === peopleNow, 'the human is reused');

ok('...and no duplicate anchor lands', (await count("SELECT count(*) n FROM studio_people sp JOIN people p ON p.id = sp.person_id WHERE p.email = 'felix.baum@example.com'")) === 1, 'ON CONFLICT arbitrates — one row per (studio, human), whatever the desk types');
ok('...reading as done, because it IS done', treeOf(desk).includes('"title":"Felix Baum"'), 'signing up somebody already on the roll is a no-op, not an error — idempotent from every starting state');

// ── who may write somebody down ──
const asMember = await asPrincipal(CAST.lumen.member, '/api/member/vex', {
  fingerprint: 'people/add',
  context: { studioPersonId: 'x', personId: 'p_ava', trialEndsOn: null, source: 'walk-in', notes: '' },
});
ok('a member cannot write people down', JSON.stringify(asMember).includes('status'), JSON.stringify(asMember).slice(0, 70));

// ── the reports moved ──
const owner = await login(CAST.lumen.owner);
await settle();
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'reports.overview' });
await settle(14);
const reportTree = treeOf(owner);
ok('an owner reaches the reports', reportTree.includes('Where the week actually goes'));
ok('...with peak hours grouped on the denormalised bucket', reportTree.includes('hour_display'), 'no date functions needed');
ok('...and attendance by program', reportTree.includes('Vinyasa Flow'));
ok('...and the book by subscription state', reportTree.includes('active'));
ok('...and plan uptake with prices', reportTree.includes('price_display'));

const deskReports = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', { fingerprint: 'reports/plan-uptake', context: {} });
ok('the desk cannot read plan uptake', JSON.stringify(deskReports).includes('status'), JSON.stringify(deskReports).slice(0, 70));

const foreign = await asPrincipal(CAST.northrock.owner, '/api/schedule/vex', { fingerprint: 'reports/attendance-by-hour', context: { from: '2000-01-01', to: '2100-01-01' } });
const lumenHours = await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', { fingerprint: 'reports/attendance-by-hour', context: { from: '2000-01-01', to: '2100-01-01' } });
ok('every studio gets its own figures', JSON.stringify(foreign) !== JSON.stringify(lumenHours), 'grouped reads are scoped like every other read');

// ── joining is a NEW ROW on the same human — never a retype ──
const beforePeople = await count('SELECT count(*)::int n FROM people');
const beforeAnchors = await count('SELECT count(*)::int n FROM studio_people');

const front = await login(CAST.lumen.desk);
await settle();
front.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(6);
// WHO is the strip; WHAT THEY HOLD is its own control — and "prospects" needs
// BOTH, which is the point of the split. Somebody holding nothing is by
// definition not Current (current means live access or a live trial), so asking
// on one axis alone answered nobody. It reads as two questions now because it
// always was two.
front.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'everyone', label: 'Everyone' } });
await settle(6);
front.dispatch({ type: 'ui:model', ref: 'holding', payload: 'nothing' });
await settle(10);
ok('the desk reaches the prospects', treeOf(front).includes('Priya Anand'), 'people, not shadow rows — the word "enquiries" is gone');

// Opening her record and starting a plan is the whole conversion.
front.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_priya' } });
await settle(14);
tree = treeOf(front);
ok('her record says what she is', tree.includes('"label":"Prospect"'), 'derived, because she holds nothing');
ok('...and offers the plan to change that', tree.includes('Start plan'));

// The desk cannot start one — contracts are the manager's pen — so the check
// hands the counter to Kaya's Lumen counterpart: the owner.
const boss = await login(CAST.lumen.owner);
await settle();
boss.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(6);
boss.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_priya' } });
await settle(14);
boss.dispatch({ type: 'ui:model', ref: 'startOffering', payload: 'pl_lumen_unlimited' });
boss.dispatch({ type: 'ui:model', ref: 'startPaidVia', payload: 'manual' });
await settle();
boss.dispatch({ type: 'ui:click', ref: 'startPlan' });
await settle(14);

const afterPeople = await count('SELECT count(*)::int n FROM people');
const afterAnchors = await count('SELECT count(*)::int n FROM studio_people');
const held = await runtime.db.query<{ status: string; paid_via: string; monthly_cents: number }>(
  "SELECT status, paid_via, monthly_cents FROM subscriptions WHERE person_id = 'p_priya'",
);

ok('joining is a subscription starting', held.rows[0]?.status === 'active', String(held.rows[0]?.status));
ok('...billed by the studio, no processor anywhere', held.rows[0]?.paid_via === 'manual');
ok('...on the offering’s own terms', Number(held.rows[0]?.monthly_cents) === 11900, 'stamped by the trigger, not typed at the counter');
ok('...creating NO new person', afterPeople === beforePeople, `${beforePeople} before, ${afterPeople} after`);
ok('...and NO new anchor', afterAnchors === beforeAnchors, 'the same human who asked, kept forever');
ok('...and where they came from survives', (await count("SELECT count(*) n FROM studio_people WHERE person_id = 'p_priya' AND source = 'website'")) === 1, 'the question the old dead column existed for');

// ── ONE ERRAND, ONE SCREEN ───────────────────────────────────
//
// Every piece of signing somebody up existed, in a different place: write the
// person down here, find them again on the roll, open their record, start a
// plan. Three screens for one errand, with somebody standing at the desk
// waiting — and nothing ever said "they are a member now", though the app knew
// the moment the row existed.
//
// The same two mutations as before. What changed is that they can be reached in
// one order, in one place, and that the ending is said out loud.
// THE MANAGER, and the reason is the charter rather than the screen. The front
// desk writes people down and sells passes; it deliberately holds no
// `subscriptions.write.insert`, because with `offerings.read` beside it that IS
// the revenue query. So the plan step is offered on this screen and refused for
// somebody who may not take it — the same refusal the record's own Plan section
// gives, drawn from data rather than from a capability check.
const front2 = await login(CAST.lumen.owner);
await settle();
front2.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.signup' });
await settle(8);
front2.dispatch({ type: 'ui:model', ref: 'newName', payload: 'Wanda Fischer' });
front2.dispatch({ type: 'ui:model', ref: 'newEmail', payload: 'wanda.fischer@example.com' });
await settle(6);
front2.dispatch({ type: 'ui:click', ref: 'create' });
await settle(12);

// ON THE ROLL, NOT A MEMBER — and the sentence says which. Standing derives from
// what somebody holds, so flattering this would be lying about a prospect.
ok('somebody written down is on the roll', treeOf(front2).includes('is on the roll'), 'a person, holding nothing — which is a real state and the roll has a lens for it');

const wanda = await runtime.db.query<{ id: string }>("SELECT id FROM people WHERE email = 'wanda.fischer@example.com'");
ok('...and exists once', wanda.rows.length === 1, `${wanda.rows.length} row`);

// AND THE STEP THAT DID NOT EXIST: onto a plan, without leaving the screen.
const anyPlan = await runtime.db.query<{ id: string }>("SELECT id FROM offerings WHERE studio_id = 'st_lumen' AND kind = 'recurring' AND active LIMIT 1");
front2.dispatch({ type: 'ui:model', ref: 'signupOffering', payload: anyPlan.rows[0]?.id });
front2.dispatch({ type: 'ui:model', ref: 'signupPaidVia', payload: 'manual' });
await settle(6);
front2.dispatch({ type: 'ui:click', ref: 'startAtSignup' });
await settle(12);

ok(
  'and they can be put on a plan without leaving it',
  (await count("SELECT count(*) n FROM subscriptions s JOIN people p ON p.id = s.person_id WHERE p.email = 'wanda.fischer@example.com'")) === 1,
  'the same mutation the record replays — one write, two places it is reachable from',
);
// THE ENDING, SAID. The row is what makes them a member and every screen already
// derived it; the person who did it was the only one not told.
ok('...and the screen says what they now are', treeOf(front2).includes('is a member from today'), 'standing is derived, and it was invisible');

report('a desk writes people down once, and joining is a subscription starting on the same human — no retype, no category flip.');

