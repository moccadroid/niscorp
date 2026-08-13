// Run: pnpm --filter lyra exec tsx src/dev/members-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';
import { ROLL_PAGE } from '@lyra/app/vex/member.entries';

const shell = login(CAST.lumen.owner);
await settle();

const trialOf = async (personId: string): Promise<string> => {
  const result = await runtime.db.query<{ d: string | null }>('SELECT trial_ends_on::text d FROM studio_people WHERE person_id = $1', [personId]);
  return String(result.rows[0]?.d ?? '');
};
const notesOf = async (personId: string): Promise<string> => {
  const result = await runtime.db.query<{ notes: string }>('SELECT notes FROM studio_people WHERE person_id = $1', [personId]);
  return String(result.rows[0]?.notes ?? '');
};
const subStatusOf = async (subscriptionId: string): Promise<string> => {
  const result = await runtime.db.query<{ status: string }>('SELECT status FROM subscriptions WHERE id = $1', [subscriptionId]);
  return String(result.rows[0]?.status ?? '');
};

// ── the list ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle();
let tree = treeOf(shell);
ok('the nav opens the roll', tree.includes('People'));
ok('...showing the current lens', tree.includes('Ava Klein'));
ok('...and NOT the paused ones', !tree.includes('Mira'), 'paused is not live access, so not the working roll');
ok('...while a live trial IS current', tree.includes('Tom Vogel'), 'the person to convert is exactly who the desk works');

shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'everyone', label: 'Everyone' } });
await settle();
tree = treeOf(shell);
ok('Everyone widens the same read', tree.includes('Mira'));
ok('...and keeps the current ones', tree.includes('Ava Klein'));
ok('...and a trial that ran out reads as such', tree.includes('Trial over'), 'computed against the studio’s own day');
ok('...and the milkman is on it', tree.includes('Bo Lindqvist'), 'somebody the studio deals with, resolved at last');

shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'contacts', label: 'Contacts' } });
await settle();
tree = treeOf(shell);
ok('the contacts lens is just the dealt-with', tree.includes('Bo Lindqvist') && !tree.includes('Ava Klein'));

shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'passes', label: 'Passes' } });
await settle();
tree = treeOf(shell);
ok('the passes lens holds the drop-in', tree.includes('Ida Brandt') && !tree.includes('Ava Klein'), 'a person with credits, not a member');

shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'current', label: 'Current' } });
await settle();
ok('Current narrows it again', !treeOf(shell).includes('Mira'));

// ── the record ──
shell.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_lena' } });
await settle();
tree = treeOf(shell);
ok('a row opens the record', tree.includes('Lena Gruber'));
ok('...with the contact details a desk needs', tree.includes('lena.gruber@example.com'));
ok('...and the note the desk wrote', tree.includes('Saturday open class'));
ok('...labelled with its standing', tree.includes('"label":"On trial"'), 'a live trial outranks the subscription beside it');

// ── the form ──
shell.dispatch({ type: 'ui:click', ref: 'edit' });
await settle();
tree = treeOf(shell);
ok('Edit opens the form', tree.includes('Edit person'));
ok('...seeded from the record, not blank', tree.includes('Saturday open class'), 'notes round-tripped into the field');
ok('...and offers NO status dropdown', !tree.includes('"label":"Status"'), 'what a person IS derives from what they hold');

shell.dispatch({ type: 'ui:model', ref: 'trialEndsOn', payload: '' });
shell.dispatch({ type: 'ui:model', ref: 'notes', payload: 'Trial converted — signed up on the spot.' });
await settle();

ok('before saving, the database is untouched', (await notesOf('p_lena')).includes('Saturday open class'));

shell.dispatch({ type: 'ui:click', ref: 'save' });
await settle(10);

// ── what the save actually did ──
ok('the save wrote the notes', (await notesOf('p_lena')).includes('signed up on the spot'));
ok('...and cleared the trial window in the same statement', (await trialOf('p_lena')) === '', 'NULL means no window, and nothing marks it');

tree = treeOf(shell);
ok('the form closed itself', !tree.includes('Edit person'));

ok('the record is what the form popped back to', tree.includes('Lena Gruber'));
ok('...and it re-read on resume, so standing moved with the data', tree.includes('"label":"Active"'), 'no trial window left, so her subscription speaks');

// ── back to the list ──
shell.dispatch({ type: 'ui:click', ref: 'back' });
await settle();
tree = treeOf(shell);
ok('Back returns to the list', tree.includes('Ava Klein'));

// ── ending a subscription keeps the record ──
shell.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_jonas' } });
await settle();
ok('a second record opens', treeOf(shell).includes('Jonas Weber'));
shell.dispatch({ type: 'ui:click', ref: 'end' });
await settle(8);
// Ending is a decision, so a confirm sheet asks first.
ok('ending asks first', treeOf(shell).includes('End their subscription?'));
shell.dispatch({ type: 'ui:click', ref: 'confirm' });
await settle(12);

ok('ending sets the status rather than deleting the row', (await subStatusOf('sub_jonas')) === 'cancelled');
const stillThere = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM subscriptions WHERE id = 'sub_jonas'");
ok('...the subscription still exists — that is how a studio sees who left', Number(stillThere.rows[0]?.n) === 1);
ok('...and the database stamped the end date, on the studio’s clock', (await runtime.db.query<{ d: string | null }>("SELECT ends_on d FROM subscriptions WHERE id='sub_jonas'")).rows[0]?.d !== null);
ok('...matching studio_today, not the server’s day', (await runtime.db.query<{ same: boolean }>("SELECT ends_on = studio_today(studio_id) AS same FROM subscriptions WHERE id='sub_jonas'")).rows[0]?.same === true);
ok('...and the person now derives as left', (await runtime.db.query<{ n: number }>("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_jonas' AND status = 'active'")).rows[0]?.n === 0, 'the standing follows the rows');

// ── coming back is a new start on today's terms ──
tree = treeOf(shell);
ok('the record now offers a plan to start', tree.includes('Start plan'), 'reactivation IS another start — the old terms left with the old subscription');

shell.dispatch({ type: 'ui:model', ref: 'startOffering', payload: 'pl_lumen_eight' });
shell.dispatch({ type: 'ui:model', ref: 'startPaidVia', payload: 'manual' });
await settle();
shell.dispatch({ type: 'ui:click', ref: 'startPlan' });
await settle(12);
const started = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_jonas' AND status = 'active' AND paid_via = 'manual'");
ok('starting a plan grants access again', Number(started.rows[0]?.n) === 1, 'a NEW subscription, billed by the studio, no processor anywhere');
ok('...with the terms stamped by the trigger', (await runtime.db.query<{ n: number }>("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_jonas' AND status = 'active' AND monthly_cents = 8900 AND currency = 'EUR'")).rows[0]?.n === 1, 'price and currency came from the offering, not the caller');

// ── back out of the second record ──
shell.dispatch({ type: 'ui:click', ref: 'back' });
await settle();
ok('Back leaves the record', !treeOf(shell).includes('Start plan'));

// ── the timetable ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'schedule.timetable' });
await settle();
tree = treeOf(shell);
ok('the nav reaches the timetable', tree.includes('Timetable'));
ok('...with classes on it', tree.includes('Morning Flow') || tree.includes('Saturday Open'));
ok('...and the programs legend', tree.includes('Vinyasa Flow'));

// ── THE WAY TO PERSON FIFTY-ONE ──────────────────────────────
//
// The roll answered fifty and there was no way to reach the fifty-first,
// against a stated target of two thousand. It SEEKS now: the next page is
// everyone sorted after the last row on screen.
//
// Seeded wide enough to page, because a check against seven people proves
// nothing about a limit of fifty.
for (let i = 0; i < 60; i += 1) {
  const id = `p_page_${String(i).padStart(3, '0')}`;
  await runtime.db.query('INSERT INTO people (id, email, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, `${id}@example.com`, `Zz Pager ${String(i).padStart(3, '0')}`]);
  await runtime.db.query("INSERT INTO studio_people (id, studio_id, person_id, source) VALUES ($1, 'st_lumen', $2, 'walk-in') ON CONFLICT DO NOTHING", [`sp_page_${i}`, id]);
}

const rollPage = async (after: string, afterId: string): Promise<{ person_id: string; person_name: string }[]> =>
  (await asPrincipal(CAST.lumen.owner, '/api/member/vex', {
    fingerprint: 'people/list',
    context: { q: '%', lens: 'everyone', after, afterId },
  })) as { person_id: string; person_name: string }[];

const known = Number((await runtime.db.query<{ n: number }>("SELECT count(*) n FROM studio_people WHERE studio_id = 'st_lumen'")).rows[0]?.n ?? 0);
const firstPage = await rollPage('', '');
const tail = firstPage[firstPage.length - 1];
const secondPage = await rollPage(tail?.person_name ?? '', tail?.person_id ?? '');
const firstIds = new Set(firstPage.map((r) => r.person_id));

ok('the roll answers a bounded page', firstPage.length === ROLL_PAGE, `${firstPage.length} of ${known} known — a screen that renders two thousand rows is not a screen`);
ok('...and there IS a fifty-first person to reach', known > ROLL_PAGE, `${known} at this studio`);
ok('...whom the next page reaches', secondPage.length > 0 && !firstIds.has(secondPage[0]?.person_id ?? ''), `page two opens at ${String(secondPage[0]?.person_name)}`);
ok('...repeating nobody', secondPage.every((r) => !firstIds.has(r.person_id)), 'a seek is anchored to the last row, so a sign-up landing above it cannot shift a page');
ok('...and between them they reach everybody', firstPage.length + secondPage.length === known, `${firstPage.length} + ${secondPage.length} of ${known}`);

report('the roll works end to end: lenses, record, edit, save, end, a fresh start on today’s terms — and a way past the fiftieth person.');
