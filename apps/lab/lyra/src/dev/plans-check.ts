// Plans check — the price list, and the one screen that never deletes.
//
// The claim under test is not "the form works". It is that retiring a plan is
// an UPDATE: everybody already paying keeps their subscription, the plan stays
// readable, and the row a report joins against is still there. A delete would
// pass a naive version of this check and take the revenue figures with it.
//
// Run: pnpm --filter lyra exec tsx src/dev/plans-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

// Lumen has no manager in the cast, so the owner stands in — the rung above
// inherits every grant the rung below holds, which is the point of a ladder.
const manager = login(CAST.lumen.owner);
await settle();

// ── the list ──
manager.dispatch({ type: 'ui:click', ref: 'nav', payload: 'plans.list' });
await settle(8);
let tree = treeOf(manager);
ok('a manager reaches the price list', tree.includes('What this studio sells'));
ok('...with prices formatted, not in cents', tree.includes('€89'), 'the mapping does the money');
ok('...and billing said in words', tree.includes('Monthly'));
ok('...and an unlimited plan says so', tree.includes('Unlimited'));

// Lumen's plans only. The engine scopes this read like every other one.
ok('...and only this studio’s plans', !tree.includes('Mat fee'), 'North Rock’s price list stays at North Rock');

// ── adding one ──
const before = await count("SELECT count(*) n FROM plans WHERE studio_id = 'st_lumen'");
manager.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Drop-in' });
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 1800 });
manager.dispatch({ type: 'ui:model', ref: 'interval', payload: 'month' });
manager.dispatch({ type: 'ui:model', ref: 'classAllowance', payload: 4 });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'create' });
await settle(10);

ok('a plan can be added', (await count("SELECT count(*) n FROM plans WHERE studio_id = 'st_lumen'")) === before + 1);
ok('...with the id minted by the database', (await count("SELECT count(*) n FROM plans WHERE name = 'Drop-in' AND length(id) = 36")) === 1, 'no client-authored primary key');
ok('...at the price given', (await count("SELECT count(*) n FROM plans WHERE name = 'Drop-in' AND price_cents = 1800 AND class_allowance = 4")) === 1);
ok('...stamped with this studio by the engine', (await count("SELECT count(*) n FROM plans WHERE name = 'Drop-in' AND studio_id = 'st_lumen'")) === 1);

tree = treeOf(manager);
ok('...and the list shows it', tree.includes('"name":"Drop-in"'), 'asserted on the ROW, not the form field');
ok('...formatted', tree.includes('€18'));
// Anchored on the price hint, which only the form has — "Add a plan" is also
// the header button, and asserting on that passes whether the form is open or not.
ok('the form closed itself', !tree.includes('In cents'));

// ── editing one ──
//
// The edit prefills from the clicked row, which is why the read carries both
// `price_cents` and `price_display`. A numeric select handing back a number
// has to survive the round trip too.
const planId = (await runtime.db.query<{ id: string }>("SELECT id FROM plans WHERE name = 'Drop-in'")).rows[0]?.id ?? '';
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { plan_id: planId, active: true, name: 'Drop-in', price_cents: 1800, interval: 'month', class_allowance: 4 } });
await settle();
ok('editing prefills from the row', treeOf(manager).includes('Edit plan'));
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 2000 });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'save' });
await settle(10);
ok('a plan can be repriced', (await count("SELECT count(*) n FROM plans WHERE name = 'Drop-in' AND price_cents = 2000")) === 1);
ok('...without touching what was not edited', (await count("SELECT count(*) n FROM plans WHERE name = 'Drop-in' AND class_allowance = 4 AND interval = 'month'")) === 1);

// ── retiring one ──
//
// THE HALF THAT MATTERS. `Unlimited` has subscribers; retiring it must leave
// every one of them exactly where they were.
const unlimitedId = (await runtime.db.query<{ id: string }>("SELECT id FROM plans WHERE name = 'Unlimited' AND studio_id = 'st_lumen'")).rows[0]?.id ?? '';
const subsBefore = await count('SELECT count(*) n FROM subscriptions WHERE plan_id = $1', [unlimitedId]);
ok('the plan under test has subscribers', subsBefore > 0, `${subsBefore} of them`);

manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { plan_id: unlimitedId, active: true, name: 'Unlimited', price_cents: 11900, interval: 'month', class_allowance: null } });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'retire' });
await settle(10);

ok('retiring stops the plan being offered', (await count('SELECT count(*) n FROM plans WHERE id = $1 AND active = false', [unlimitedId])) === 1);
ok('...and does NOT delete it', (await count('SELECT count(*) n FROM plans WHERE id = $1', [unlimitedId])) === 1);
ok('...and every subscriber keeps their subscription', (await count('SELECT count(*) n FROM subscriptions WHERE plan_id = $1', [unlimitedId])) === subsBefore);

tree = treeOf(manager);
ok('...and the list still shows it, marked', tree.includes('Retired'), 'greyed rather than gone');

// ── offering it again ──
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { plan_id: unlimitedId, active: false, name: 'Unlimited', price_cents: 11900, interval: 'month', class_allowance: null } });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'restore' });
await settle(10);
ok('a retired plan can be offered again', (await count('SELECT count(*) n FROM plans WHERE id = $1 AND active = true', [unlimitedId])) === 1);

// ── who may set prices ──
//
// The desk sells plans; it does not decide what they cost. Both rings say so,
// and this asserts the one that cannot be worked around from a browser.
const deskWrite = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', {
  fingerprint: 'plans/update',
  context: { planId: unlimitedId, name: 'Free', priceCents: 0, interval: 'month', classAllowance: '' },
});
ok('the desk cannot reprice a plan', JSON.stringify(deskWrite).includes('status'), JSON.stringify(deskWrite).slice(0, 70));
ok('...and the price is untouched', (await count('SELECT count(*) n FROM plans WHERE id = $1 AND price_cents = 11900', [unlimitedId])) === 1, 'refused, not merely hidden');

const foreignWrite = await asPrincipal(CAST.northrock.manager, '/api/studio/vex', {
  fingerprint: 'plans/retire',
  context: { planId: unlimitedId },
});
ok('a manager cannot retire another studio’s plan', JSON.stringify(foreignWrite).includes('status') || (await count('SELECT count(*) n FROM plans WHERE id = $1 AND active = true', [unlimitedId])) === 1, 'scope, not just role');

const deskSees = login(CAST.lumen.desk);
await settle();
ok('the desk has no Plans in its nav', !treeOf(deskSees).includes('"label":"Plans"'), 'ring 1 removes the door, not just the lock');

report('the price list edits, and retiring keeps everybody who is paying.');
