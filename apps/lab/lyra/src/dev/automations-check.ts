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

ok('an owner reaches Automations', tree.includes('The things that happen without anybody doing them'));
ok('...and it is reachable, through Settings', tree.includes('"label":"Settings"'), 'the menu holds areas; a hub holds screens');

ok('...opening on recipes, not an empty form', tree.includes('Welcome somebody the day they join') && tree.includes('Catch a trial before it runs out'));
ok('...and every one of them leaves the building', !tree.includes('desk’s list') && !tree.includes('tag them') && !tree.includes('tell the studio'), 'an effect that writes where the trigger read is a query');
ok('...saying which ones are already running', tree.includes('"state_label":"Running"'), 'a recipe a studio has is not an offer');

owner.dispatch({ type: 'ui:click', ref: 'view', payload: { value: 'running', showRecipes: false, showRunning: true, showOutbox: true } });
await settle(16);
tree = treeOf(owner);

ok('...listing what each one DOES, as a sentence', tree.includes('When somebody joins, email them'), 'composed in the entry’s mapping from the vocabulary it joins');
// The card body is read at a glance: it says what the MOMENT is, not what
// email is like. ⟲ Joining both blurbs put "Nothing is delivered yet…" on
// every card. Asserted on the FIELD, because the effect's words are still on
// the row — carried for the form, which is where choosing an effect happens.
const bodies = [...tree.matchAll(/"intent":"([^"]*)"/g)].map((m) => m[1] ?? '');
ok(
  '...and that body is the moment’s words, not the effect’s',
  bodies.length > 0 && bodies.every((body) => !body.includes('no mail integration')),
  `${bodies.length} cards, none of them explaining email twice`,
);
ok('...and the composition it is made of', tree.includes('"moment":"member.joined"') && tree.includes('"effect":"email"'));
ok('...and how it last ran', tree.includes('Never') || tree.includes('done'));
ok('...with its state', tree.includes('"state_label":"Armed"'));

ok('...and a watched one says so rather than naming an hour', tree.includes('As it happens'), 'tide’s poll trigger, on a heartbeat');
ok('...while a scheduled one names its hour', tree.includes('Every day at'));

const shown = (tree.match(/"reflex_id":"/g) ?? []).length;
ok('an owner sees only their own studio’s automations', shown === 5, `${shown} shown, six loaded across two studios`);
ok('...and none of the competitor’s', !tree.includes('st_northrock:'), 'the id carries the studio, and the fn filters on the session’s');

// ── the dry run ──────────────────────────────────────────────
const queuedBefore = await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'");
// A WATCHED one deliberately: it fires per write, anchored to the row that
// caused it, so there is nothing due to rehearse without one — and the sheet
// must SAY that rather than answering a question the automation does not run
// on. (Its real proof is tide-check's live path: a write lands, it fires.)
owner.dispatch({ type: 'ui:click', ref: 'preview', payload: { reflex_id: 'st_lumen:au_lumen_welcome', name: 'Welcome to Lumen' } });
await settle(16);
tree = treeOf(owner);
ok('a reflex can be previewed', tree.includes('What it would do'));
ok('...and a watched one says it runs on the write, not on a rehearsal', tree.includes('Runs as it happens'), 'the moment its write lands');
ok('...and it changed nothing', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'")) === queuedBefore);

// ── running a clocked one by hand ────────────────────────────
// The trial window is nudged so somebody is genuinely inside it today — a
// manual run that fans out to zero would assert nothing.
await runtime.db.query(`UPDATE studio_people SET trial_ends_on = studio_today('st_lumen') + 2 WHERE id = 'sp_lena'`);
owner.dispatch({ type: 'ui:click', ref: 'run', payload: { reflex_id: 'st_lumen:au_lumen_trial' } });
await settle(24);
ok('an automation can be run by hand', treeOf(owner).includes('Ran it'));

const queuedAfter = await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'");
ok('...and it queued a message somebody can read', queuedAfter > queuedBefore, `${queuedAfter - queuedBefore} queued from one run`);

// HOW IT LAST RAN CAME OFF THE ROW, and the row was written by the engine's
// own ledger through a trigger. A mirror nobody proves is a column that says
// "Never" forever and passes every test that accepts "Never".
const mirrored = await runtime.db.query<{ state: string; done: number }>(
  "SELECT last_run_state state, last_run_done done FROM automations WHERE id = 'au_lumen_trial'",
);
ok(
  'the ledger wrote back how it ran',
  mirrored.rows[0]?.state === 'settled' && Number(mirrored.rows[0]?.done) > 0,
  `${String(mirrored.rows[0]?.state)}, ${String(mirrored.rows[0]?.done)} done — a trigger on the engine's own runs, because the ledger is keyed by a composed id no join can carry`,
);
ok('...and the card reads it as a fact, not a query', treeOf(owner).includes('done'), 'one entry answers the whole screen');
ok('...marked as not delivered, because nothing delivers', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen' AND state = 'queued'")) === queuedAfter, 'honest about the seam that is missing');

ok('...and Lyra’s own automations wrote no jobs', (await count("SELECT count(*) n FROM notifications WHERE studio_id = 'st_lumen'")) === 0, 'what a query can answer is a screen, not a list');

owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'automations.list' });
await settle(16);
owner.dispatch({ type: 'ui:click', ref: 'view', payload: { value: 'running', showRecipes: false, showRunning: true, showOutbox: true } });
await settle(10);

// ── pausing ──────────────────────────────────────────────────
owner.dispatch({ type: 'ui:click', ref: 'pause', payload: { reflex_id: 'st_lumen:au_lumen_quiet', automation_id: 'au_lumen_quiet' } });
await settle(16);
tree = treeOf(owner);
ok('an automation can be paused', tree.includes('"state_label":"Paused"'));
ok('...and the screen says the trigger stopped, not the person', tree.includes('It will not fire on its own; you still can'));

owner.dispatch({ type: 'ui:click', ref: 'arm', payload: { reflex_id: 'st_lumen:au_lumen_quiet', automation_id: 'au_lumen_quiet' } });
await settle(16);
ok('...and armed again', !treeOf(owner).includes('"state_label":"Paused"'));

// ── the builder tells you who it would reach ─────────────────
//
// Before this, a studio could compose an automation and save it without ever
// learning whether it reached anybody, and both ways of getting that wrong had
// already shipped: a moment that matched nobody on any day of the year, and
// three whose selections the automation principal is not permitted to read —
// refused on every run, with the refusal visible only in a parked task.
//
// The rehearsal runs the REAL selection as the REAL principal, so a missing
// grant is a sentence in the form rather than silence in production.
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'automations.list' });
await settle(16);
owner.dispatch({ type: 'ui:click', ref: 'useRecipe', payload: { id: 'trial-ending', moment: 'trial.ending', effect: 'email', run_at: '09:00', days: 7, subject: 'Your trial is nearly up', body: 'Talk to us.' } });
await settle(20);
tree = treeOf(owner);

ok('the builder says who this would reach, before it is saved', /match(es)? this right now/.test(tree), 'preview used to live on the list, after the thing was already running');
ok('...by name, not as a count somebody has to trust', tree.includes('Lena'), 'the same selection the reflex runs, as the same principal');
ok('...and it never claims a refusal is an empty result', !tree.includes('not allowed by scope policy') || tree.includes('cannot run'), 'a moment the rung cannot read says so in words');

// A watched recipe has no count to promise — its audience is whoever the
// next write concerns, and the form says so instead of guessing.
owner.dispatch({ type: 'ui:click', ref: 'useRecipe', payload: { id: 'welcome', moment: 'member.joined', effect: 'email', run_at: '09:00', days: 7, subject: 'Welcome', body: 'Hello.', watched: true, uses_days: false, days_label: '', moment_phrase: 'somebody joins', moment_blurb: 'The moment a subscription starts.', effect_phrase: 'email them', effect_blurb: 'Queued in the outbox.', uses_message: true, subject_label: 'Subject', body_label: 'Message', message_hint: 'What they would receive.' } });
await settle(20);
ok('...and a watched recipe says it runs as it happens', treeOf(owner).includes('Runs as it happens'), 'every time somebody joins — not a number to trust');

// ── THE VOCABULARY IS THE MANIFEST'S, NOT A FUNCTION'S ───────
//
// Three functions used to answer "what moments are there", "what effects",
// and "what shape is this pairing" — three round trips to be told what the
// release already ships. The options are baked into the action now and each
// one CARRIES its own shape, so choosing one IS learning what the form
// should show. This is the assertion that the option's payload, and nothing
// else, is what moves the form.
const momentPick = {
  value: 'trial.ending',
  phrase: 'a trial is about to run out',
  blurb: 'People whose free window closes within the next few days.',
  watched: false,
  usesDays: true,
  daysLabel: 'Days of notice',
};
owner.dispatch({ type: 'ui:model', ref: 'moment', payload: momentPick });
await settle(20);
tree = treeOf(owner);
ok('picking a moment reshapes the form from the option itself', tree.includes('Days of notice'), 'no round trip: the option carries whether the number means anything, and what it is called');
ok('...and the sentence is recomposed from both halves', tree.includes('When a trial is about to run out, email them'), 'staged through a message, because a same-batch $prism reads the batch’s opening data');
ok('...and a clocked moment stops claiming it runs as it happens', !treeOf(owner).includes('Runs as it happens'), 'the hour is back, because this one has one');

// ── the boundary, attacked directly ──────────────────────────
const rockQueued = await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_northrock'");
owner.dispatch({ type: 'ui:click', ref: 'run', payload: { reflex_id: 'st_northrock:au_rock_trial' } });
await settle(20);
ok('an owner cannot run a competitor’s automation', treeOf(owner).includes('not yours'), 'checked in one place, because the ledger is not in the database the engine guards');
ok('...and the competitor’s rows are untouched', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_northrock'")) === rockQueued);

owner.dispatch({ type: 'ui:click', ref: 'preview', payload: { reflex_id: 'st_northrock:au_rock_class', name: 'x' } });
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
const anonInputs = app.shell?.inputs?.({ principal: null, actions: ['auth.login'] }) ?? {};
const loginTree = JSON.stringify(anonInputs);
ok('the sign-in list offers real people', loginTree.includes('Ava Klein'));
ok('...and not the automations', !loginTree.includes('Lumen automations'), 'a principal that never logs in does not belong on the login screen');
ok('...nor mislabels one as a member', !loginTree.includes('North Rock automations'));

// ── the one that is a negative ───────────────────────────────
const quiet = async (cutoff: string): Promise<string[]> => {
  const rows = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'automation/not-seen-since', context: { cutoff } });
  return Array.isArray(rows) ? rows.map((r) => String((r as { person_name: string }).person_name)) : [];
};

const truth = async (cutoff: string): Promise<number> => {
  const r = await runtime.db.query<{ n: string }>(
    `SELECT count(*) n FROM subscriptions m
      WHERE m.studio_id = 'st_lumen' AND m.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
           WHERE b.person_id = m.person_id AND b.studio_id = m.studio_id AND b.attended = true AND cs.held_on >= $1::date
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

// Falsifiable: three assertions agreeing on a constant would prove nothing.
ok('...and the window moves the answer', spread.size > 1, [...spread].join(' → '));

report('the automations are recipes, sentences and jobs a human reads — visible, previewable, pausable, and still one studio’s own.');
