// Run: pnpm --filter lyra exec tsx src/dev/plans-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

// THE ROW THE LIST ACTUALLY HANDS OVER, not one written out here.
//
// A row typed into this file is a row that agrees with the screen only until
// somebody adds a column, and that is not hypothetical: the opener was missing
// `joining_fee_id` for as long as the column existed, so correcting a typo in a
// plan's name quietly stopped its joining fee being charged, and a hand-written
// payload in this check said everything was fine.
const rowFor = async (name: string): Promise<Record<string, unknown>> => {
  const answer = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'offerings/list', context: { sortBy: '', sortDir: 'asc' } });
  const rows = Array.isArray(answer) ? (answer as Record<string, unknown>[]) : [];
  return rows.find((r) => r['name'] === name) ?? {};
};

const manager = await login(CAST.lumen.owner);
await settle();

// ── the list ──
manager.dispatch({ type: 'ui:click', ref: 'nav', payload: 'plans.list' });
await settle(8);
let tree = treeOf(manager);
ok('a manager reaches the offers list', tree.includes('Everything a member can pay for'));
// Not `€89`: a German studio writes `89,00 €`, symbol last. The claim is cents
// became money, so the assertion is the major units and the symbol, in either
// order — which side it lands on is the language's business, not this check's.
const money = (amount: number, tree: string): boolean => new RegExp(`€\\s?${String(amount)}\\b|\\b${String(amount)}[.,]\\d\\d\\s?€`).test(tree);
ok('...with prices formatted, not in cents', money(89, tree), 'the mapping does the money');
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
ok('...formatted', money(18, tree));
ok('the form closed itself', !tree.includes('In cents'));

// ── THE TERMS ARE THE STUDIO'S, NOT OURS ─────────────────────
//
// Every one of these was a fixed menu: three, six, twelve or twenty-four months;
// fourteen, thirty, sixty or ninety days; four, eight, twelve or sixteen
// classes. A studio on a four-month term with forty-five days' notice could not
// say so — not because anything refused it (the columns are plain integers with
// a `>= 0` check) but because nobody had typed those numbers into a list.
//
// So the assertion is deliberately a shape none of those menus could produce.
// It is not about 4 and 45; it is that we stopped having an opinion.
const oddBefore = await count("SELECT count(*) n FROM offerings WHERE studio_id = 'st_lumen'");
manager.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Four months, six weeks notice' });
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 7250 });
manager.dispatch({ type: 'ui:model', ref: 'interval', payload: 'month' });
manager.dispatch({ type: 'ui:model', ref: 'classAllowance', payload: 6 });
manager.dispatch({ type: 'ui:model', ref: 'minimumTermMonths', payload: 4 });
manager.dispatch({ type: 'ui:model', ref: 'noticeDays', payload: 45 });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'create' });
await settle(10);

ok('a studio can author terms no menu of ours offered', (await count("SELECT count(*) n FROM offerings WHERE studio_id = 'st_lumen'")) === oddBefore + 1, 'four months, forty-five days, six classes');
ok(
  '...and they land exactly as typed',
  (await count("SELECT count(*) n FROM offerings WHERE name = 'Four months, six weeks notice' AND minimum_term_months = 4 AND notice_days = 45 AND class_allowance = 6")) === 1,
  'no rounding to the nearest thing we had thought of',
);

// EMPTY IS A REAL ANSWER, and a different one per column — the difference a
// Select never had to express, because a Select cannot be blank.
manager.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Rolling, unlimited' });
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 9900 });
manager.dispatch({ type: 'ui:model', ref: 'interval', payload: 'month' });
manager.dispatch({ type: 'ui:model', ref: 'classAllowance', payload: '' });
manager.dispatch({ type: 'ui:model', ref: 'minimumTermMonths', payload: '' });
manager.dispatch({ type: 'ui:model', ref: 'noticeDays', payload: '' });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'create' });
await settle(10);

ok(
  'a cleared allowance is unlimited, and a cleared term is rolling',
  (await count("SELECT count(*) n FROM offerings WHERE name = 'Rolling, unlimited' AND class_allowance IS NULL AND minimum_term_months = 0 AND notice_days = 0")) === 1,
  'NULL where absence is the answer, 0 where none is a term — not one rule for both',
);

// ── HOW OFTEN IS THE STUDIO'S TOO ────────────────────────────
//
// 'month' and 'year' were the whole vocabulary, so a studio billing quarterly —
// ordinary in AT and DE — could not write its own price list down. The period is
// a pair now: a unit and a count, which is also exactly what Stripe's Price
// takes, so nothing between the two gets an opinion about which periods exist.
//
// The arithmetic is the part worth asserting. `monthly_cents` is SUMMED to make
// every revenue figure in the app, so a quarterly plan that reported its whole
// price as monthly would treble a studio's forecast — and it would look
// plausible, which is the failure mode that survives a demo.
manager.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Quarterly' });
manager.dispatch({ type: 'ui:model', ref: 'priceCents', payload: 33000 });
manager.dispatch({ type: 'ui:model', ref: 'interval', payload: 'month' });
manager.dispatch({ type: 'ui:model', ref: 'intervalCount', payload: 3 });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'create' });
await settle(10);

ok(
  'a studio can bill on a period the app had no word for',
  (await count("SELECT count(*) n FROM offerings WHERE name = 'Quarterly' AND interval = 'month' AND interval_count = 3")) === 1,
  'every three months — a unit and a count, not a fifth named period',
);

// Somebody on it, so the trigger has something to stamp. Written directly for
// the same reason the notice probe below is: the arithmetic under test is the
// DATABASE's, and routing through a screen would put a second thing in the way
// of finding out whether it is right.
const quarterlyId = (await runtime.db.query<{ id: string }>("SELECT id FROM offerings WHERE name = 'Quarterly'")).rows[0]?.id ?? '';
const anyLumen = await runtime.db.query<{ id: string }>("SELECT person_id AS id FROM studio_people WHERE studio_id = 'st_lumen' LIMIT 1");
await runtime.db.query(
  `INSERT INTO subscriptions (id, studio_id, person_id, offering_id, status)
   VALUES ('sub_quarter_probe', 'st_lumen', $1, $2, 'active')`,
  [anyLumen.rows[0]?.id, quarterlyId],
);
const quarterlyMonthly = await count("SELECT COALESCE(monthly_cents, 0) n FROM subscriptions WHERE id = 'sub_quarter_probe'");
ok(
  '...and €330 every three months is €110 a month, not €330',
  quarterlyMonthly === 11000,
  `${String(quarterlyMonthly)} cents — the figure every forecast in this app is a sum of`,
);

// REPRICING THE PERIOD MOVES IT TOO. The resync trigger fired on price and
// interval and not on the count, so a plan moved from monthly to quarterly kept
// reporting its old monthly value — a studio's forecast frozen at three times
// the truth, with nothing on any screen to say so.
await asPrincipal(CAST.lumen.owner, '/api/studio/vex', {
  fingerprint: 'offerings/update',
  context: { offeringId: quarterlyId, name: 'Quarterly', priceCents: 33000, interval: 'month', intervalCount: 1, classAllowance: null, minimumTermMonths: 0, noticeDays: 0, credits: null, validDays: null, joiningFeeId: null },
});
ok(
  '...and moving it back to monthly moves the figure with it',
  (await count("SELECT COALESCE(monthly_cents, 0) n FROM subscriptions WHERE id = 'sub_quarter_probe'")) === 33000,
  'the resync trigger watches the count, not only the price and the unit',
);

// ── editing one ──
const planId = (await runtime.db.query<{ id: string }>("SELECT id FROM offerings WHERE name = 'Drop-in'")).rows[0]?.id ?? '';
// The payload IS the row the list hands over, so it carries the terms too —
// without them the form opens with nothing in those fields and Save writes the
// nothing back over a commitment somebody sold.
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: await rowFor('Drop-in') });
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

manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { offering_id: unlimitedId, kind: 'recurring', active: true, name: 'Unlimited', price_cents: 11900, interval: 'month', interval_count: 1, class_allowance: null } });
await settle();
manager.dispatch({ type: 'ui:click', ref: 'retire' });
await settle(10);

ok('retiring stops the plan being offered', (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND active = false', [unlimitedId])) === 1);
ok('...and does NOT delete it', (await count('SELECT count(*) n FROM offerings WHERE id = $1', [unlimitedId])) === 1);
ok('...and every subscriber keeps their subscription', (await count('SELECT count(*) n FROM subscriptions WHERE offering_id = $1', [unlimitedId])) === subsBefore);

tree = treeOf(manager);
ok('...and the list still shows it, marked', tree.includes('Retired'), 'greyed rather than gone');

// ── offering it again ──
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: { offering_id: unlimitedId, kind: 'recurring', active: false, name: 'Unlimited', price_cents: 11900, interval: 'month', interval_count: 1, class_allowance: null } });
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
  context: { offeringId: unlimitedId, name: 'Free', priceCents: 0, interval: 'month', intervalCount: 1, classAllowance: '', minimumTermMonths: 0, noticeDays: 0, credits: null, validDays: null, joiningFeeId: null },
});
ok('the desk cannot reprice a plan', JSON.stringify(deskWrite).includes('status'), JSON.stringify(deskWrite).slice(0, 70));
ok('...and the price is untouched', (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND price_cents = 11900', [unlimitedId])) === 1, 'refused, not merely hidden');

const foreignWrite = await asPrincipal(CAST.northrock.manager, '/api/studio/vex', {
  fingerprint: 'offerings/set-active',
  context: { offeringId: unlimitedId, active: false },
});
ok('a manager cannot retire another studio’s plan', JSON.stringify(foreignWrite).includes('status') || (await count('SELECT count(*) n FROM offerings WHERE id = $1 AND active = true', [unlimitedId])) === 1, 'scope, not just role');

const deskSees = await login(CAST.lumen.desk);
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
  context: { name: 'Six months, two months notice', kind: 'recurring', priceCents: 9900, interval: 'month', intervalCount: 1, classAllowance: null, minimumTermMonths: 6, noticeDays: 60, credits: null, validDays: null, joiningFeeId: null },
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
const record = await login(CAST.lumen.owner);
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


// ── A MISTAKE IS NOT A PRODUCT ───────────────────────────────
//
// Retiring was the only way out of anything, so a mistyped price stayed on the
// list forever wearing a "Retired" badge. Deleting exists for the row nobody
// ever held; retiring still exists for the one somebody does.
manager.dispatch({ type: 'ui:click', ref: 'nav', payload: 'plans.list' });
await settle(10);
manager.dispatch({ type: 'ui:click', ref: 'add' });
await settle();
manager.dispatch({ type: 'ui:model', ref: 'name', payload: '' });
await settle(4);
ok(
  'a nameless price cannot be added',
  treeOf(manager).includes('"label":"Add plan","disabled":true'),
  'the sheet used to open with Add live, and pressing it wrote a nameless row at zero that could then only be retired',
);
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Typo' });
await settle(4);
ok('...and a named one can', treeOf(manager).includes('"label":"Add plan","disabled":false'));
manager.dispatch({ type: 'ui:click', ref: 'create' });
await settle(12);

manager.dispatch({ type: 'ui:click', ref: 'edit', payload: await rowFor('Typo') });
await settle(8);
const typoOpen = treeOf(manager);
ok('a row nobody ever took offers Delete, not Retire', typoOpen.includes('"label":"Delete"') && !typoOpen.includes('"label":"Retire"'));
ok('...and says what that means', typoOpen.includes('Nobody has ever taken this'), 'a danger button with no sentence beside it makes somebody guess');
manager.dispatch({ type: 'ui:click', ref: 'delete' });
await settle(12);
ok('...and it goes', (await count("SELECT count(*) n FROM offerings WHERE name = 'Typo'")) === 0, 'gone, not retired');

manager.dispatch({ type: 'ui:click', ref: 'edit', payload: await rowFor('Unlimited') });
await settle(8);
const heldOpen = treeOf(manager);
ok('a row somebody holds offers Retire, not Delete', heldOpen.includes('"label":"Retire"') && !heldOpen.includes('"label":"Delete"'));
ok('...counting them out loud', heldOpen.includes('people hold this'), 'the number is the reason, so the screen says the number');

// THE BUTTON IS A HINT; THE DATABASE IS THE ANSWER. Clicked anyway, past a
// control this screen did not draw — because a count read a moment ago is a
// count that can be wrong by the time somebody acts on it, and the refusal has
// to be a sentence rather than a constraint name either way.
const heldId = (await runtime.db.query<{ id: string }>("SELECT id FROM offerings WHERE name = 'Unlimited' AND studio_id = 'st_lumen'")).rows[0]?.id ?? '';
manager.dispatch({ type: 'ui:click', ref: 'delete' });
await settle(12);
ok(
  'and deleting a held one is refused in words',
  treeOf(manager).includes('Retire it instead'),
  'three foreign keys already said no, unreadably — this is the sentence that replaces them',
);
ok('...leaving it exactly where it was', (await count('SELECT count(*) n FROM offerings WHERE id = $1', [heldId])) === 1);
manager.dispatch({ type: 'ui:click', ref: 'close' });
await settle(6);

// AND THE FEE SURVIVES AN EDIT. The row the form opens on has to carry every
// column Save writes, and this one was missing: the plan naming a joining fee
// stopped naming it the moment somebody corrected its name.
manager.dispatch({ type: 'ui:click', ref: 'edit', payload: await rowFor('Unlimited') });
await settle(8);
manager.dispatch({ type: 'ui:model', ref: 'name', payload: 'Unlimited ' });
await settle(4);
manager.dispatch({ type: 'ui:click', ref: 'save' });
await settle(12);
ok(
  'renaming a plan does not stop it charging its joining fee',
  (await count("SELECT count(*) n FROM offerings WHERE studio_id = 'st_lumen' AND btrim(name) = 'Unlimited' AND joining_fee_id IS NOT NULL")) === 1,
  'every column Save writes has to travel on the row Save opened from',
);

report('the price list edits, retiring keeps everybody who is paying, a studio charges in one currency, and a commitment outlives the notice given inside it.');
