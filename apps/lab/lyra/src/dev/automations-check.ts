// Automations check — the subsystem made visible, and the one boundary in this
// application the engine does not enforce.
//
// Everything else in Lyra is scoped by a compiled policy: a request cannot name
// another studio's rows because the engine ANDs its own filter onto every
// statement. The tide LEDGER is not in that database — it lives in a memory
// store — so the studio filter is ordinary code in
// `server/functions/automations.ts`, and ordinary code is exactly what needs a
// check written against it.
//
// The studio comes from the SESSION, never from the request. That is what this
// file is really asserting: there is no argument a browser can send that moves
// the answer, because there is no argument at all.
//
// Run: pnpm --filter lyra exec tsx src/dev/automations-check.ts
import { CAST } from '@lyra/db/seed';
import { app, asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql);
  return Number(result.rows[0]?.n ?? -1);
};

// ── the screen ───────────────────────────────────────────────
const owner = login(CAST.lumen.owner);
await settle(10);
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'automations.list' });
await settle(16);
let tree = treeOf(owner);

ok('an owner reaches Automations', tree.includes('What this studio does overnight'));

// THE FINDABILITY POINT. The automations worked for a whole session before
// this screen existed — lapsing memberships overnight with nothing in the app
// to show for it. A subsystem nobody can see is one nobody is responsible for.
// Reached through SETTINGS, not from the menu directly. The menu holds six
// areas and stops growing; a hub holds the screens. What matters for
// findability is unchanged — there is a door — but it is one level in, which is
// what keeps the menu six long at fifty features.
ok('...and it is reachable, through Settings', tree.includes('"label":"Settings"'), 'the menu holds areas; a hub holds screens');

// Each row leads with the reflex's INTENT, which is why the schema demands one.
// The name is COMPOSED from the two halves — what it does, to whom — rather
// than being a template id an operator was asked to be responsible for.
ok('...listing what each one DOES, in words', tree.includes('Mark the trial lapsed — trials past their window'));
ok('...and the composition it is made of', tree.includes('\"audience\":\"trials.ending\"') && tree.includes('\"effect\":\"trial.lapse\"'));
ok('...and how it last ran', tree.includes('Never run') || tree.includes('done'));
ok('...with its state', tree.includes('"state_label":"Armed"'));

// Three studios' worth of reflexes are loaded; an owner sees three, not six.
const shown = (tree.match(/"reflex_id":"/g) ?? []).length;
ok('an owner sees only their own studio’s automations', shown === 3, `${shown} shown, six loaded across two studios`);
ok('...and none of the competitor’s', !tree.includes('st_northrock:'), 'the id carries the studio, and the fn filters on the session’s');

// ── the dry run ──────────────────────────────────────────────
//
// The verb that makes this screen safe to hand somebody. It runs the real
// pipeline and stubs exactly one function — the effect executor.
const trialsBefore = await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_lumen' AND status = 'trialling'");
owner.dispatch({ type: 'ui:click', ref: 'preview', payload: { reflex_id: 'st_lumen:au_lumen_lapse', intent: 'Mark a trial lapsed' } });
await settle(16);
tree = treeOf(owner);
ok('a reflex can be previewed', tree.includes('A dry run. Nothing below has happened'));
ok('...and it changed nothing', (await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_lumen' AND status = 'trialling'")) === trialsBefore);

// ── running it by hand ───────────────────────────────────────
const messagesBefore = await count("SELECT count(*) n FROM notifications WHERE studio_id = 'st_lumen'");
owner.dispatch({ type: 'ui:click', ref: 'run', payload: { reflex_id: 'st_lumen:au_lumen_lapse' } });
await settle(24);
tree = treeOf(owner);
ok('an automation can be run by hand', tree.includes('Ran it'));

// The digest watches the firing settle, so running one reflex produces the
// other's output — fan-in, with no callback and nothing shared.
const messagesAfter = await count("SELECT count(*) n FROM notifications WHERE studio_id = 'st_lumen'");
ok('...and the fan-in digest followed', messagesAfter > messagesBefore, `${messagesAfter - messagesBefore} message(s) from one run`);
ok('...shown on the same screen', treeOf(owner).includes('Trials lapsed overnight'), 'the outcome a human reads, not the ledger');

// ── pausing ──────────────────────────────────────────────────
owner.dispatch({ type: 'ui:click', ref: 'pause', payload: { reflex_id: 'st_lumen:au_lumen_lapse' } });
await settle(16);
tree = treeOf(owner);
ok('an automation can be paused', tree.includes('"state_label":"Paused"'));
ok('...and the screen says the clock stopped, not the person', tree.includes('The clock will not fire it; you still can'));

owner.dispatch({ type: 'ui:click', ref: 'arm', payload: { reflex_id: 'st_lumen:au_lumen_lapse' } });
await settle(16);
ok('...and armed again', !treeOf(owner).includes('"state_label":"Paused"'));

// ── the boundary, attacked directly ──────────────────────────
//
// The fn takes NO studio argument, so this dispatches the competitor's reflex
// id at Lumen's owner. Ordinary code has to refuse it, because no engine will.
const rockTrials = await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_northrock' AND status = 'trialling'");
owner.dispatch({ type: 'ui:click', ref: 'run', payload: { reflex_id: 'st_northrock:au_rock_lapse' } });
await settle(20);
ok('an owner cannot run a competitor’s automation', treeOf(owner).includes('not yours'), 'checked in one place, because the ledger is not in the database the engine guards');
ok('...and the competitor’s members are untouched', (await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_northrock' AND status = 'trialling'")) === rockTrials);

owner.dispatch({ type: 'ui:click', ref: 'preview', payload: { reflex_id: 'st_northrock:au_rock_remind', intent: 'x' } });
await settle(16);
ok('...nor preview one', treeOf(owner).includes('not yours'));

// ── who may see any of it ────────────────────────────────────
const desk = login(CAST.lumen.desk);
await settle(10);
ok('the desk is offered no Settings at all', !treeOf(desk).includes('"label":"Settings"'), 'an automation changes memberships overnight — same rung as the price list');

const member = login(CAST.lumen.member);
await settle(10);
ok('a member certainly does not', !treeOf(member).includes('"label":"Settings"'));


// ── an automation is not a person you can be ─────────────────
//
// They are people as far as the directory is concerned, which is what puts
// them under the charter — and that is exactly why they turned up on the demo
// sign-in list labelled "Member". Wrong twice: an automation is not a member,
// and nobody should be able to sign in as one.
const anonInputs = app.shell?.inputs?.({ principal: null, actions: ['auth.login'] }) ?? {};
const loginTree = JSON.stringify(anonInputs);
ok('the sign-in list offers real people', loginTree.includes('Ava Klein'));
ok('...and not the automations', !loginTree.includes('Lumen automations'), 'a principal that never logs in does not belong on the login screen');
ok('...nor mislabels one as a member', !loginTree.includes('North Rock automations'));

// ── THE ONE THAT IS A NEGATIVE ───────────────────────────────
//
// Every other audience selects people who DID something. "Still paying and
// has stopped coming" selects people who did NOT, which needs a correlated
// NOT EXISTS: the inner query compares against the outer member's id, so the
// question is asked once per member. Counting attendances and testing for
// zero cannot work — a member with no rows produces no row to count.
//
// Asserted against hand-written SQL at three cutoffs rather than against a
// fixed number: a count that happens to match is not evidence, and the seed
// moves.
const quiet = async (cutoff: string): Promise<string[]> => {
  const rows = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'automation/not-seen-since', context: { cutoff } });
  return Array.isArray(rows) ? rows.map((r) => String((r as { person_name: string }).person_name)) : [];
};

const truth = async (cutoff: string): Promise<number> => {
  const r = await runtime.db.query<{ n: string }>(
    `SELECT count(*) n FROM memberships m
      WHERE m.studio_id = 'st_lumen' AND m.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
           WHERE b.membership_id = m.id AND b.attended = true AND cs.held_on >= $1::date
        )`,
    [cutoff],
  );
  return Number(r.rows[0]?.n ?? -1);
};

const spread = new Set<number>();
for (const cutoff of ['2026-08-04', '2026-08-06', '2026-08-09']) {
  const got = await quiet(cutoff);
  const want = await truth(cutoff);
  spread.add(want);
  ok(`who has stopped coming, as of ${cutoff}`, got.length === want, `${got.length} against ${want} in SQL — ${got.join(', ') || 'nobody'}`);
}

// Falsifiable: three assertions that all agreed on a constant would prove
// nothing about the window.
ok('...and the window moves the answer', spread.size > 1, [...spread].join(' → '));

report('the automations are visible, previewable, pausable — and still one studio’s own.');
