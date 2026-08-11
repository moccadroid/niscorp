// Members check — list → detail → form → save → the list knows.
//
// This drives the REAL shell the way a person does: click a row, click Edit,
// change a field, save. It asserts on the render tree and on the database,
// because either one alone can lie — a tree can show a value nothing wrote,
// and a row can change without the screen ever noticing.
//
// The last assertion is the one worth having: after a save, the LIST re-reads
// itself. Nothing wires those two together except a channel, and a change
// announcement that nobody hears is the failure this catches.
//
// Run: pnpm --filter lyra exec tsx src/dev/members-check.ts
import { CAST } from '@lyra/db/seed';
import { login, ok, report, runtime, settle, treeOf } from './world';

const shell = login(CAST.lumen.owner);
await settle();

const statusOf = async (membershipId: string): Promise<string> => {
  const result = await runtime.db.query<{ status: string }>('SELECT status FROM memberships WHERE id = $1', [membershipId]);
  return String(result.rows[0]?.status ?? '');
};
const notesOf = async (membershipId: string): Promise<string> => {
  const result = await runtime.db.query<{ notes: string }>('SELECT notes FROM memberships WHERE id = $1', [membershipId]);
  return String(result.rows[0]?.notes ?? '');
};

// ── the list ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle();
let tree = treeOf(shell);
ok('the nav opens the roll', tree.includes('Members'));
ok('...showing current members', tree.includes('Ava Klein'));
ok('...and NOT the lapsed ones by default', !tree.includes('Felix Baum'), 'Felix is lapsed');

// The other slice is the same read with a different parameter — and the
// parameter arrives WITH the choice, which is why one ref serves both slices.
// A bare `{ value: 'everyone' }` would widen nothing: the statuses are on the
// option, not looked up from it.
shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'everyone', label: 'Everyone', statuses: ['active', 'trialling', 'paused', 'lapsed', 'cancelled'] } });
await settle();
tree = treeOf(shell);
ok('Everyone widens the same read', tree.includes('Felix Baum'));
ok('...and keeps the current ones', tree.includes('Ava Klein'));

shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'current', label: 'Current', statuses: ['active', 'trialling'] } });
await settle();
ok('Current narrows it again', !treeOf(shell).includes('Felix Baum'));

// ── the record ──
shell.dispatch({ type: 'ui:click', ref: 'open', payload: { membership_id: 'mb_lena' } });
await settle();
tree = treeOf(shell);
ok('a row opens the record', tree.includes('Lena Gruber'));
ok('...with the contact details a desk needs', tree.includes('lena.gruber@example.com'));
ok('...and the note the desk wrote', tree.includes('Saturday open class'));
ok('...labelled with its status', tree.includes('"label":"Trial"'));

// ── the form ──
shell.dispatch({ type: 'ui:click', ref: 'edit' });
await settle();
tree = treeOf(shell);
ok('Edit opens the form', tree.includes('Edit member'));
ok('...seeded from the record, not blank', tree.includes('Saturday open class'), 'notes round-tripped into the field');

// Change both fields the form owns, the way a person would.
shell.dispatch({ type: 'ui:model', ref: 'status', payload: 'active' });
shell.dispatch({ type: 'ui:model', ref: 'notes', payload: 'Trial converted — signed up on the spot.' });
await settle();

ok('before saving, the database is untouched', (await statusOf('mb_lena')) === 'trialling');

shell.dispatch({ type: 'ui:click', ref: 'save' });
await settle(10);

// ── what the save actually did ──
ok('the save wrote the status', (await statusOf('mb_lena')) === 'active', await statusOf('mb_lena'));
ok('...and the notes, in the same statement', (await notesOf('mb_lena')).includes('signed up on the spot'));

tree = treeOf(shell);
ok('the form closed itself', !tree.includes('Edit member'));

// Popping the form lands on the RECORD, not the list — a stack canvas renders
// its top, and the list is suspended underneath. Worth being precise about:
// dispatching a list ref here would go nowhere, because a suspended action
// receives nothing.
ok('the record is what the form popped back to', tree.includes('Lena Gruber'));
ok('...and it re-read on resume, so it shows the new status', tree.includes('"label":"Active"') && !tree.includes('"label":"Trial"'), 'the badge, not the note text — the note now contains the word Trial');

// ── back to the list ──
// THE ONE THAT MATTERS: the list was never told to re-read. It heard a channel.
shell.dispatch({ type: 'ui:click', ref: 'back' });
await settle();
tree = treeOf(shell);
ok('Back returns to the list', tree.includes('Ava Klein'));
ok('...which re-read itself when the save announced', !tree.includes('"label":"Trial"'), 'no Trial badge left on the roll');

// ── ending a membership keeps the record ──
shell.dispatch({ type: 'ui:click', ref: 'open', payload: { membership_id: 'mb_jonas' } });
await settle();
ok('a second record opens', treeOf(shell).includes('Jonas Weber'));
shell.dispatch({ type: 'ui:click', ref: 'end' });
await settle(10);

ok('ending sets the status rather than deleting the row', (await statusOf('mb_jonas')) === 'cancelled');
const stillThere = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM memberships WHERE id = 'mb_jonas'");
ok('...the membership still exists — that is how a studio sees who left', Number(stillThere.rows[0]?.n) === 1);
// STAMPED BY THE DATABASE, on the studio's clock — the write does not carry a
// date at all. A write dated by whichever machine made the request is wrong in
// the record forever, unlike a read, which corrects itself next time.
ok('...and the database stamped the end date, on the studio’s clock', (await runtime.db.query<{ d: string | null }>("SELECT ended_on d FROM memberships WHERE id='mb_jonas'")).rows[0]?.d !== null);
ok('...matching studio_today, not the server’s day', (await runtime.db.query<{ same: boolean }>("SELECT ended_on = studio_today(studio_id) AS same FROM memberships WHERE id='mb_jonas'")).rows[0]?.same === true);

tree = treeOf(shell);
ok('the record offers the way back', tree.includes('Reactivate'));

shell.dispatch({ type: 'ui:click', ref: 'reactivate' });
await settle(10);
ok('reactivating returns it to active', (await statusOf('mb_jonas')) === 'active');
ok('...and clears the end date', (await runtime.db.query<{ d: string | null }>("SELECT ended_on d FROM memberships WHERE id='mb_jonas'")).rows[0]?.d === null);

// ── back out of the second record ──
shell.dispatch({ type: 'ui:click', ref: 'back' });
await settle();
ok('Back leaves the record', !treeOf(shell).includes('Reactivate'));

// ── the timetable ──
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'schedule.timetable' });
await settle();
tree = treeOf(shell);
ok('the nav reaches the timetable', tree.includes('Timetable'));
ok('...with classes on it', tree.includes('Morning Flow') || tree.includes('Saturday Open'));
ok('...and the programs legend', tree.includes('Vinyasa Flow'));

report('the roll works end to end: list, record, edit, save, and the list heard about it.');
