// Run: pnpm --filter lyra exec tsx src/dev/plans-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

const manager = login(CAST.lumen.owner);
await settle();

// ── the list ──
manager.dispatch({ type: 'ui:click', ref: 'nav', payload: 'plans.list' });
await settle(8);
let tree = treeOf(manager);
ok('a manager reaches the price list', tree.includes('Everything this studio sells'));
ok('...with prices formatted, not in cents', tree.includes('€89'), 'the mapping does the money');
ok('...and billing said in words', tree.includes('Monthly'));
ok('...and an unlimited plan says so', tree.includes('Unlimited'));

ok('...and only this studio’s plans', !tree.includes('Mat fee'), 'North Rock’s price list stays at North Rock');

// ── adding one ──
const before = await count("SELECT count(*) n FROM offerings WHERE studio_id = 'st_lumen'");
manager.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Drop-in' });
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 1800 });
manager.dispatch({ type: 'ui:model', ref: 'interval', payload: 'month' });
manager.dispatch({ type: 'ui:model', ref: 'classAllowance', payload: 4 });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'create' });
await settle(10);

ok('a plan can be added', (await count("SELECT count(*) n FROM offerings WHERE studio_id = 'st_lumen'")) === before + 1);
ok('...with the id minted by the database', (await count("SELECT count(*) n FROM offerings WHERE name = 'Drop-in' AND length(id) = 36")) === 1, 'no client-authored primary key');
ok('...at the price given', (await count("SELECT count(*) n FROM offerings WHERE name = 'Drop-in' AND price_cents = 1800 AND class_allowance = 4")) === 1);
ok('...stamped with this studio by the engine', (await count("SELECT count(*) n FROM offerings WHERE name = 'Drop-in' AND studio_id = 'st_lumen'")) === 1);

tree = treeOf(manager);
ok('...and the list shows it', tree.includes('"name":"Drop-in"'), 'asserted on the ROW, not the form field');
ok('...formatted', tree.includes('€18'));
ok('the form closed itself', !tree.includes('In cents'));

// ── editing one ──
const planId = (await runtime.db.query<{ id: string }>("SELECT id FROM offerings WHERE name = 'Drop-in'")).rows[0]?.id ?? '';
// The payload IS the row the list hands over, so it carries the terms too —
// without them the form opens with nothing in those fields and Save writes the
// nothing back over a commitment somebody sold.
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { offering_id: planId, kind: 'recurring', active: true, name: 'Drop-in', price_cents: 1800, interval: 'month', class_allowance: 4, minimum_term_months: 0, notice_days: 0, credits: null, valid_days: null } });
await settle();
ok('editing prefills from the row', treeOf(manager).includes('Edit offering'));
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 2000 });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'save' });
await settle(10);
ok('a plan can be repriced', (await count("SELECT count(*) n FROM offerings WHERE name = 'Drop-in' AND price_cents = 2000")) === 1);
ok('...without touching what was not edited', (await count("SELECT count(*) n FROM offerings WHERE name = 'Drop-in' AND class_allowance = 4 AND interval = 'month'")) === 1);

// ── retiring one ──
const unlimitedId = (await runtime.db.query<{ id: string }>("SELECT id FROM offerings WHERE name = 'Unlimited' AND studio_id = 'st_lumen'")).rows[0]?.id ?? '';
const subsBefore = await count('SELECT count(*) n FROM subscriptions WHERE offering_id = $1', [unlimitedId]);
ok('the plan under test has subscribers', subsBefore > 0, `${subsBefore} of them`);

manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { offering_id: unlimitedId, kind: 'recurring', active: true, name: 'Unlimited', price_cents: 11900, interval: 'month', class_allowance: null } });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'retire' });
await settle(10);

ok('retiring stops the plan being offered', (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND active = false', [unlimitedId])) === 1);
ok('...and does NOT delete it', (await count('SELECT count(*) n FROM offerings WHERE id = $1', [unlimitedId])) === 1);
ok('...and every subscriber keeps their subscription', (await count('SELECT count(*) n FROM subscriptions WHERE offering_id = $1', [unlimitedId])) === subsBefore);

tree = treeOf(manager);
ok('...and the list still shows it, marked', tree.includes('Retired'), 'greyed rather than gone');

// ── offering it again ──
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { offering_id: unlimitedId, kind: 'recurring', active: false, name: 'Unlimited', price_cents: 11900, interval: 'month', class_allowance: null } });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'restore' });
await settle(10);
ok('a retired plan can be offered again', (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND active = true', [unlimitedId])) === 1);

// ── who may set prices ──
const deskWrite = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', {
  fingerprint: 'offerings/update',
  // The terms travel too, so this is refused for the RIGHT reason — the rung —
  // rather than for a missing field, which would pass the assertion while
  // proving nothing about who may set prices.
  context: { offeringId: unlimitedId, name: 'Free', priceCents: 0, interval: 'month', classAllowance: '', minimumTermMonths: 0, noticeDays: 0, credits: null, validDays: null },
});
ok('the desk cannot reprice a plan', JSON.stringify(deskWrite).includes('status'), JSON.stringify(deskWrite).slice(0, 70));
ok('...and the price is untouched', (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND price_cents = 11900', [unlimitedId])) === 1, 'refused, not merely hidden');

const foreignWrite = await asPrincipal(CAST.northrock.manager, '/api/studio/vex', {
  fingerprint: 'offerings/set-active',
  context: { offeringId: unlimitedId, active: false },
});
ok('a manager cannot retire another studio’s plan', JSON.stringify(foreignWrite).includes('status') || (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND active = true', [unlimitedId])) === 1, 'scope, not just role');

const deskSees = login(CAST.lumen.desk);
await settle();
ok('the desk has no Plans in its nav', !treeOf(deskSees).includes('"label":"Plans"'), 'ring 1 removes the door, not just the lock');

// ── ONE CURRENCY PER STUDIO, and the database is what says so ──
//
// `monthly_cents` is SUMMED across a studio's subscriptions with no currency
// predicate. Two currencies in one studio would not have failed — they would
// have quietly added together and reported a revenue figure that was not any
// amount of money. So the rule is a composite foreign key on (studio, currency)
// rather than a convention, and this is the proof it bites.
//
// Not a CHECK: a CHECK cannot see another row, so "all this studio's plans
// agree" is not expressible as one.
const wrongCurrency = await runtime.db
  .query("INSERT INTO offerings (studio_id, name, price_cents, currency, interval) VALUES ('st_lumen', 'Dollars please', 5000, 'USD', 'month')")
  .then(() => '')
  .catch((err: unknown) => String(err));
ok('a plan cannot be priced in a currency its studio does not charge in', wrongCurrency !== '', wrongCurrency.split('\n')[0] ?? '');
ok('...and none landed', (await count("SELECT count(*) n FROM offerings WHERE currency <> 'EUR'")) === 0, 'refused by the key, not cleaned up afterwards');

// The same key reaches the money that hangs off a plan. A subscription's
// currency is stamped from its plan by the trigger, so this is the belt to that
// braces: even a hand-written row cannot disagree with its studio.
const wrongSub = await runtime.db
  .query("UPDATE subscriptions SET currency = 'USD' WHERE studio_id = 'st_lumen'")
  .then(() => '')
  .catch((err: unknown) => String(err));
ok('...nor can a subscription drift from it', wrongSub !== '', wrongSub.split('\n')[0] ?? '');

// ── THE ASSERTION S6 EXISTS FOR, AND IT HAS NEVER BEEN MADE ──
//
// A six-month term with sixty days' notice. Give notice in month two and the
// naive answer — notice plus the notice period — says they leave in month four.
// They do not. A commitment outlives notice given inside it, so they leave at
// the end of month six, and the difference is two months of revenue on every
// member who ever walks in and says they are thinking of stopping.
//
// The trigger has computed this correctly since the beginning
// (GREATEST(committed_until, notice_given_on + notice_days)) and nothing has
// ever written a term, a notice period, or a notice — so it has never once run.
const termPlan = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', {
  fingerprint: 'offerings/create',
  context: { name: 'Six months, two months notice', kind: 'recurring', priceCents: 9900, interval: 'month', classAllowance: null, minimumTermMonths: 6, noticeDays: 60, credits: null, validDays: null },
});
const planRow = await runtime.db.query<{ id: string; minimum_term_months: number; notice_days: number }>(
  "SELECT id, minimum_term_months, notice_days FROM offerings WHERE name = 'Six months, two months notice'",
);
const sold = planRow.rows[0];
ok('a plan can be sold on terms', sold !== undefined && sold.minimum_term_months === 6 && sold.notice_days === 60, JSON.stringify(sold ?? termPlan));

// Somebody two months into it. Started in the past so "month two" is now.
const member = await runtime.db.query<{ id: string }>("SELECT person_id AS id FROM studio_people WHERE studio_id = 'st_lumen' LIMIT 1");
await runtime.db.query(
  `INSERT INTO subscriptions (id, studio_id, person_id, offering_id, status, started_on)
   VALUES ('sub_term_probe', 'st_lumen', $1, $2, 'active', studio_today('st_lumen') - INTERVAL '2 months')`,
  [member.rows[0]?.id, sold?.id],
);
const stamped = await runtime.db.query<{ committed_until: string; ends_on: string | null }>(
  "SELECT committed_until, ends_on FROM subscriptions WHERE id = 'sub_term_probe'",
);
ok('...and signing stamps the commitment', stamped.rows[0]?.committed_until !== null, `committed until ${String(stamped.rows[0]?.committed_until).slice(0, 10)} — four months out, from a term that started two months ago`);
ok('...with no leaving date yet', stamped.rows[0]?.ends_on === null, 'nobody has said anything');

// The act under test, through the app's own surface.
await asPrincipal(CAST.lumen.owner, '/api/studio/vex', {
  fingerprint: 'subscriptions/give-notice',
  context: { subscriptionId: 'sub_term_probe' },
});
const after = await runtime.db.query<{ notice_given_on: string; ends_on: string; committed_until: string; today: string; naive: string }>(
  `SELECT notice_given_on, ends_on, committed_until, studio_today('st_lumen') AS today,
          (notice_given_on + INTERVAL '60 days')::date AS naive
     FROM subscriptions WHERE id = 'sub_term_probe'`,
);
const row = after.rows[0];
const day = (value: unknown): string => String(value).slice(0, 10);

ok('giving notice dates itself on the studio’s own day', day(row?.notice_given_on) === day(row?.today), `${day(row?.notice_given_on)} — the browser sent a subscription id and nothing else`);
ok('...and they leave at the END OF THE TERM', day(row?.ends_on) === day(row?.committed_until), `${day(row?.ends_on)} — month six`);
ok('...NOT sixty days from today', day(row?.ends_on) !== day(row?.naive), `month four would have been ${day(row?.naive)} — two months of revenue, on every member who ever gives notice early`);

// And it is reversible, because everything at a desk is.
await asPrincipal(CAST.lumen.owner, '/api/studio/vex', {
  fingerprint: 'subscriptions/withdraw-notice',
  context: { subscriptionId: 'sub_term_probe' },
});
const undone = await runtime.db.query<{ notice_given_on: string | null; ends_on: string | null }>(
  "SELECT notice_given_on, ends_on FROM subscriptions WHERE id = 'sub_term_probe'",
);
ok('taking notice back leaves nothing behind', undone.rows[0]?.notice_given_on === null && undone.rows[0]?.ends_on === null, 'the leaving date was derived from the notice, so it goes with it');

// The seed's own notice still stands — a trigger that clears on the way in
// would have deleted it silently, and this is the assertion that caught that.
ok('a subscription seeded with notice keeps it', (await count("SELECT count(*) n FROM subscriptions WHERE notice_given_on IS NOT NULL AND id <> 'sub_term_probe'")) > 0, 'the ledger row is the fact; the column follows it');

// ── and it is reachable, which is the part that was missing ──
//
// The columns, the trigger and the arithmetic were all correct before any of
// this; what did not exist was a way for a person to use them. So the last
// assertion is that the record actually draws it, and that the control changes
// depending on what has been decided rather than sitting there twice.
const record = login(CAST.lumen.owner);
await settle(10);
const withNotice = await runtime.db.query<{ id: string }>(
  "SELECT person_id AS id FROM subscriptions WHERE studio_id = 'st_lumen' AND notice_given_on IS NOT NULL AND status = 'active' ORDER BY id LIMIT 1",
);
const withoutNotice = await runtime.db.query<{ id: string }>(
  "SELECT person_id AS id FROM subscriptions WHERE studio_id = 'st_lumen' AND notice_given_on IS NULL AND status = 'active' ORDER BY id LIMIT 1",
);

const openRecord = async (personId: string | undefined): Promise<string> => {
  record.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
  await settle(12);
  record.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: personId } });
  await settle(16);
  return treeOf(record);
};

const staying = await openRecord(withoutNotice.rows[0]?.id);
ok('the member record shows what they committed to', staying.includes('Plan and terms') && staying.includes('Minimum term'), 'terms on the record, not only in the price list');
ok('...and offers the way out', staying.includes('Give notice'), 'the write that did not exist');

const leaving = await openRecord(withNotice.rows[0]?.id);
ok('somebody who gave notice reads as leaving', leaving.includes('"label":"Leaving"'), 'with the last day, derived');
ok('...and is offered the way back, not a second way out', leaving.includes('changed their mind') && !leaving.includes('Give notice'), 'one decision, one control');

report('the price list edits, retiring keeps everybody who is paying, a studio charges in one currency, and a commitment outlives the notice given inside it.');
