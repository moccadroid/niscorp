// Run: pnpm --filter lyra exec tsx src/dev/tide-check.ts
//
// THE TRANSPORT STANDS IN ITS LAB MODE FOR THE WHOLE OF THIS FILE. A check
// with no provider key would watch every message record `failed: no provider
// configured` and would have proved only that the failure path works. The sink
// sends nothing and says so in the id (`sink_…`); everything up to the wire is
// the deployed path.
//
// Written above the imports for the reader, NOT for the runtime: ES modules
// hoist their imports, so this assignment runs after every module below has
// been evaluated. It works because the transport reads its environment per
// call rather than at import — see send.ts, which says why.
process.env['MAIL_SINK'] = 'log';

import { reflexesForEveryStudio, wireTide } from '@lyra/server/tide';
import { CAST, LUMEN, NORTHROCK } from '@lyra/db/seed';
import { asPrincipal, ok, report, runtime, server, tideDriver } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

const DAY = 86_400_000;
const wallClock = new Date();
const boot = Date.UTC(wallClock.getUTCFullYear(), wallClock.getUTCMonth(), wallClock.getUTCDate(), 12, 0, 0);

/** The calendar day a reflex fired at boot + offset is living in. */
const dayAt = (offset: number): string => new Date(boot + offset).toISOString().slice(0, 10);

// THIS CHECK OWNS THE CLOCK, so the live driver stands down first.
//
// ⟲ Two engines over one ledger is two of everything. This check drives its
// own instance with a fake `now` weeks ahead; the booted driver wakes on
// every write at the real one. They materialized different occurrences of
// the same clock reflex and both ran, so "one reminder per booking" got five
// for four. The old 60-second metronome hid it by being slower than a whole
// check run — a driver that wakes on every write does not. Writes still MINT
// facts (a stopped driver still ingests), which is what the live path below
// depends on; nothing advances the engine except the lines in this file.
tideDriver().stop();

const tide = wireTide({ server: () => server, now: () => boot, pool: runtime.pool, base: () => 'http://localhost:5180' });

// ── load ─────────────────────────────────────────────────────
const studios = await runtime.db.query<{ id: string; timezone: string }>('SELECT id, timezone FROM studios ORDER BY id');
const automationRows = await runtime.db.query('SELECT id, studio_id, moment, effect, enabled, run_at, days, subject, body FROM automations');
const reflexes = reflexesForEveryStudio(studios.rows, automationRows.rows as never);
const derivedDigests = 0;
const loaded = await tide.load(reflexes, { at: boot });

// ONE PER ROW, PLUS TWO PER STUDIO. The extras are infrastructure rather than
// a studio's automations: the outbox DISPATCHER, which wakes on the write, and
// the SWEEP, which is the net under it — a delivered-once fact cannot wake
// anything for a row whose process died mid-send.
ok(
  'each studio runs its own automations, and the thing that sends them',
  reflexes.length === automationRows.rows.length + studios.rows.length * 2 + derivedDigests,
  `${reflexes.length} reflexes from ${automationRows.rows.length} rows, ${studios.rows.length} studios × 2 (dispatch + sweep) plus ${derivedDigests} derived digest(s)`,
);
ok(
  '...and they differ per studio',
  reflexes.filter((r) => r.id.startsWith(LUMEN)).length !== reflexes.filter((r) => r.id.startsWith(NORTHROCK)).length,
  `${reflexes.filter((r) => r.id.startsWith(LUMEN)).length} at Lumen, ${reflexes.filter((r) => r.id.startsWith(NORTHROCK)).length} at North Rock — which a studio can change itself`,
);

// ── EVERY MOMENT THIS APP SHIPS SELECTS SOMEBODY ─────────────
//
// The check that was missing, and the one that would have caught the mess.
// There were thirteen moments; three of them named tables the automation
// principal is not granted to read, so they were REFUSED on every run — and
// one of those three was offered in the builder as a recipe a studio could
// click. Nothing said so, because nothing here had ever asked a moment to
// select anybody.
//
// It asks now, for all of them, against this dataset. A moment that cannot
// find a person on any day is a moment nobody should be able to choose.
const { MOMENTS } = await import('@lyra/app/reflexes/compose');
const { reflexesFor } = await import('@lyra/app/reflexes/compose');

const probes = MOMENTS.map((moment) => ({
  id: `probe_${moment.id}`,
  studio_id: LUMEN,
  moment: moment.id,
  effect: 'email',
  enabled: true,
  run_at: '09:00',
  days: 7,
  subject: `Probe ${moment.id}`,
  body: 'Probe.',
}));
const probeTide = wireTide({ server: () => server, now: () => boot, pool: runtime.pool, base: () => 'http://localhost:5180' });
await probeTide.load(reflexesFor(LUMEN, 'Europe/Vienna', probes as never), { at: boot });

const robotFor = 'automation@lumen.studio';
for (const moment of MOMENTS) {
  let best = 0;
  let sample = '';
  let refusal = '';

  if (moment.watch !== undefined) {
    // A watched moment fires per write, anchored on the fact's own row — so
    // the claim to test is its ENRICHMENT: given a row that exists, does the
    // anchored selection find the person behind it, as the automation rung?
    const anchorRow = await runtime.db.query<{ id: string }>(
      moment.watch.entity === 'subscriptions'
        ? `SELECT id FROM subscriptions WHERE studio_id = 'st_lumen' AND status = 'active' LIMIT 1`
        : `SELECT sp.id FROM studio_people sp WHERE sp.studio_id = 'st_lumen' AND sp.held_subscriptions = 0 AND sp.works_here = false AND sp.deals_here = false LIMIT 1`,
    );
    const anchorId = anchorRow.rows[0]?.id ?? '';
    const key = moment.watch.entity === 'subscriptions' ? 'subscriptionId' : 'studioPersonId';
    const answer = await asPrincipal(robotFor, '/api/automation/vex', { fingerprint: moment.fingerprint, context: { [key]: anchorId, horizon: '9999-12-31' } });
    const rows = Array.isArray(answer) ? (answer as Record<string, unknown>[]) : [];
    best = rows.length;
    if (best === 0) refusal = JSON.stringify(answer).slice(0, 70);
    else sample = `${String(rows[0]?.['person_name'] ?? '?')} <${String(rows[0]?.['mail_to'] ?? '?')}>`;
  } else {
    // A clock moment is a window on the calendar, so it is asked across a
    // fortnight rather than at one instant — "never, on any day" is the
    // claim being tested, not "not at noon today".
    for (const offset of [0, 1, 3, 7, 14]) {
      const report = await probeTide.preview(`${LUMEN}:probe_${moment.id}`, { now: boot + offset * DAY }).catch((error: unknown) => ({ fired: false, selected: 0, reason: String(error), units: [] }));
      if (!report.fired) refusal = String(report.reason ?? '').slice(0, 70);
      if (report.selected > best) {
        best = report.selected;
        const row = (report.units[0]?.env as { row?: Record<string, unknown> } | undefined)?.row ?? {};
        sample = `${String(row['person_name'] ?? '?')} <${String(row['mail_to'] ?? '?')}>`;
      }
    }
  }
  ok(`"when ${moment.label}" finds somebody`, best > 0, refusal !== '' ? `REFUSED — ${refusal}` : `${best} selected, e.g. ${sample}`);
  // `mail_to`, not `people.email` — the anchor's RESOLVED address, which for a
  // child is their guardian's. A moment that selects somebody it cannot write
  // to is a run that dies at the outbox's NOT NULL.
  ok(`...and hands the effect a person to write to`, best === 0 || sample.includes('@'), sample);
}
ok('...and they all load', loaded.loaded === reflexes.length, JSON.stringify(loaded.warnings ?? []).slice(0, 90));
// NO UNGUARDED CYCLE — which is a different claim from "no cycle", and the
// right one. The outbox dispatcher watches `outbox` and its effect writes
// `outbox`, so the graph reports a loop; it is keyed by entity and cannot see
// that the watch is on `insert` while the write is an update. What makes that
// loop safe is not its absence but its GUARD: the selection re-reads the row
// and answers with nothing for a message already claimed, so it converges.
// Asserting the count would have banned the shape tide was built to allow.
const unguarded = (loaded.cycles ?? []).filter((cycle) => !cycle.guarded);
ok('...and every cycle in the graph passes a guard', unguarded.length === 0, JSON.stringify(loaded.cycles ?? []).slice(0, 120));

const bogus = await tide
  .load([{ ...reflexes[0]!, id: 'bogus', effect: { name: 'automation/pay-everybody', input: {} } }], { at: boot })
  .then(() => 'accepted')
  .catch((error: unknown) => String(error));
ok('an effect the app cannot write is refused at load', bogus !== 'accepted', String(bogus).slice(0, 90));

// ── preview: the dry run that costs nothing ──────────────────
const lumenTrial = `${LUMEN}:au_lumen_trial`;
const queuedBefore = await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'");

const preview = await tide.preview(lumenTrial, { now: boot });
ok('a reflex previews against real data', preview !== undefined);
ok('...selecting nothing, because nothing is due yet', JSON.stringify(preview).includes('"selected":0'), 'four days left against a three-day window');

const previewLater = await tide.preview(lumenTrial, { now: boot + 2 * DAY });
ok('...and finding her once the window opens', JSON.stringify(previewLater).includes('Lena'), JSON.stringify(previewLater).slice(0, 90));
ok('...and writes nothing', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'")) === queuedBefore, 'a dry run that changed data would not be a dry run');

// ── firing it ────────────────────────────────────────────────
await tide.fire(lumenTrial, { now: boot, by: 'tide-check' });
await tide.advance({ now: boot });
ok('nothing goes out before the window opens', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'")) === queuedBefore);

const later = boot + 2 * DAY;
await tide.fire(lumenTrial, { now: later, by: 'tide-check' });
await tide.advance({ now: later });
await tide.advance({ now: later });

ok('a trial inside the window produces a message', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'")) > queuedBefore);
ok('...in the studio’s own words', (await count("SELECT count(*) n FROM outbox WHERE subject = 'Your trial is nearly up'")) >= 1, 'authored on the row, not hardcoded in a shape');
ok('...and changed nobody’s standing', (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_lena' AND status = 'active'")) === 1, 'an automation may add a message; it may not move a person');

ok('a competitor’s outbox is untouched', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_northrock'")) === 0, 'the reflex names no studio; the engine supplies it');

// ── idempotency ──────────────────────────────────────────────
const afterOnce = await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'");
await tide.advance({ now: later });
ok('a settled firing does not run again', (await count("SELECT count(*) n FROM outbox WHERE studio_id = 'st_lumen'")) === afterOnce, 'idempotent by task key');

// ── fan-out: one task per person ─────────────────────────────
const lumenRemind = `${LUMEN}:au_lumen_remind`;
const busiest = await runtime.db.query<{ d: string; n: number }>(
  `SELECT cs.held_on::text d, count(*) n
     FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
    WHERE cs.studio_id = 'st_lumen' AND b.status = 'booked' AND cs.status = 'scheduled'
      AND cs.held_on > $1::date
    GROUP BY 1 ORDER BY n DESC, d ASC LIMIT 1`,
  [dayAt(0)],
);
const targetDay = busiest.rows[0]?.d ?? '';
const due = Number(busiest.rows[0]?.n ?? 0);

const fireAt = Date.parse(`${targetDay}T12:00:00Z`) - DAY;
await tide.fire(lumenRemind, { now: fireAt, by: 'tide-check' });
for (let i = 0; i < 4; i += 1) await tide.advance({ now: fireAt + i });

const reminders = await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_remind' AND studio_id = 'st_lumen'");
ok('a reminder per booking, not one for the batch', reminders === due, `${reminders} written for ${due} bookings — each retries independently`);
ok('...and there was work to fan out', due > 0, `${due} on ${targetDay} — a fan-out of zero would assert nothing`);
if (due > 0) {
  ok('...in the studio’s own words', (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_remind' AND subject = 'See you tomorrow'")) === reminders, 'authored on the row, not hardcoded in a shape');
  ok('...still naming the class and time', (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_remind' AND body LIKE '%(%at%)'")) === reminders);
  ok('...and addressed to the person booked', (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_remind' AND person_id IS NOT NULL")) === reminders);
}

// ── WATCHED: writes wake automations, through the bridge's shape ──
//
// Three of this app's moments are watched rather than scheduled. A watched
// moment runs the instant its write lands: vex's write observer hands moss
// every committed statement with its rows, and moss mints one write fact per
// row, stamped with the writing studio's automation identity. This section
// drives that shape DETERMINISTICALLY — the rows land by SQL and the facts
// are ingested exactly as the bridge mints them, at times this check owns.
// (The live path, vex write → fact → welcome with no hand on the clock, is
// proven at the end of this file.)
const welcomeReflex = `${LUMEN}:au_lumen_welcome`;
// AFTER everything above, so no earlier fake-now is later than these facts.
const joinAt = Math.max(boot + 3 * DAY, fireAt) + DAY;
const welcomedBefore = await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_welcome'");

// THREE people join in the same minute — new humans, written down and put on
// a plan in one breath, exactly what an intro night's counter does. Joining
// IS the subscription row landing; that is the write the moment watches.
for (const [person, subscription, name] of [
  ['p_join_a', 'sub_join_a', 'Nadia Okonkwo'],
  ['p_join_b', 'sub_join_b', 'Tomas Berg'],
  ['p_join_c', 'sub_join_c', 'Priya Raman'],
] as const) {
  await runtime.db.query(`INSERT INTO people (id, email, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [person, `${person}@example.com`, name]);
  await runtime.db.query(
    `INSERT INTO studio_people (id, studio_id, person_id, source) VALUES ($1, 'st_lumen', $2, 'walk-in') ON CONFLICT DO NOTHING`,
    [`sp_${person}`, person],
  );
  await runtime.db.query(
    `INSERT INTO subscriptions (id, studio_id, person_id, offering_id, status)
     VALUES ($1, 'st_lumen', $2, 'pl_lumen_eight', 'active')
     ON CONFLICT DO NOTHING`,
    [subscription, person],
  );
  await tide.ingest({ kind: 'write', entity: 'subscriptions', op: 'insert', row: { id: subscription, studio_id: 'st_lumen', person_id: person }, at: joinAt }, { as: 'automation@st_lumen' });
}

for (let i = 1; i <= 6; i += 1) await tide.advance({ now: joinAt + i });

const welcomed = (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_welcome'")) - welcomedBefore;
ok('three people joining in one minute get three welcomes', welcomed === 3, `${welcomed} of 3 — overlap governs repeats, not distinct events`);
ok('...and none of them was refused as an overlap', (await count(`SELECT count(*) n FROM tide_run WHERE reflex_id = '${welcomeReflex}' AND state = 'skipped'`)) === 0, 'a skipped run here is a member nobody greeted');
ok('...each addressed to the person who joined', (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_welcome' AND person_id IS NOT NULL")) === welcomed + welcomedBefore);

// And still exactly once: a delivered fact is done, and a later advance has
// nothing to re-match — at-most-once lives on rows, not on memory.
for (let i = 7; i <= 10; i += 1) await tide.advance({ now: joinAt + i });
ok('...and a later advance does not greet them again', (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_welcome'")) - welcomedBefore === 3, 'one fact, one welcome — the fact is delivered, not re-discovered');

// ── AN ENQUIRY IS A WRITE TOO ────────────────────────────────
//
// An enquiry is the anchor row appearing, holding nothing — no shadow table,
// no status word. The write fact carries the anchor row; the reflex's
// selection re-reads it through the mirrors and answers the person.
const enquiryAt = joinAt + 2 * DAY;
await runtime.db.query(`INSERT INTO people (id, email, name) VALUES ('p_ask', 'p_ask@example.com', 'Sam Whitlock') ON CONFLICT DO NOTHING`);
await runtime.db.query(
  `INSERT INTO studio_people (id, studio_id, person_id, source)
   VALUES ('sp_ask', 'st_lumen', 'p_ask', 'website') ON CONFLICT DO NOTHING`,
);
await tide.ingest({ kind: 'write', entity: 'studio_people', op: 'insert', row: { id: 'sp_ask', studio_id: 'st_lumen', person_id: 'p_ask' }, at: enquiryAt }, { as: 'automation@st_lumen' });
for (let i = 1; i <= 4; i += 1) await tide.advance({ now: enquiryAt + i });
ok(
  'an enquiry write produces a greeting',
  (await count("SELECT count(*) n FROM outbox WHERE source = 'au_lumen_enquiry' AND subject = 'Thanks for getting in touch'")) >= 1,
  'the anchor row appearing IS the moment',
);

// ── EVERY SEEDED CLOCK AUTOMATION ACTUALLY SENDS ─────────────
//
// Selecting somebody and reaching them are different claims, and only the
// second one is the feature. Each clocked row this studio ships is fired by
// hand — the builder's "Run it now" — and the outbox read back for what
// landed. The two watched rows have no by-hand story: a write fact IS their
// firing, and the sections above are their proof.
//
// These are a WINDOW on the calendar — a trial three days out, a class
// tomorrow — so each is fired at a moment it can actually find somebody,
// discovered by asking preview rather than by hardcoding a date that rots as
// the seed moves. Each search starts from boot independently, because the
// windows do not overlap: the trial closes days before the classes fill.
for (const [automation, subject] of [
  ['au_lumen_trial', 'Your trial is nearly up'],
  ['au_lumen_quiet', 'We have missed you'],
  ['au_lumen_remind', 'See you tomorrow'],
] as const) {
  const before = await count('SELECT count(*) n FROM outbox WHERE source = $1', [automation]);

  let at = boot;
  for (let day = 0; day <= 21; day += 1) {
    const when = boot + day * DAY;
    const report = await tide.preview(`${LUMEN}:${automation}`, { now: when }).catch(() => ({ selected: 0 }));
    if (report.selected > 0) {
      at = when;
      break;
    }
  }

  await tide.fire(`${LUMEN}:${automation}`, { now: at, by: 'tide-check' });
  for (let i = 0; i < 3; i += 1) await tide.advance({ now: at + i });
  const written = (await count('SELECT count(*) n FROM outbox WHERE source = $1', [automation])) - before;

  ok(`running "${automation}" by hand reaches somebody`, written > 0, `${written} message(s)`);
  ok(
    '...in the studio’s own words',
    (await count('SELECT count(*) n FROM outbox WHERE source = $1 AND subject = $2', [automation, subject])) >= written,
    `"${subject}" — authored on the row, not hardcoded in a shape`,
  );
  ok('...addressed to a real person', (await count('SELECT count(*) n FROM outbox WHERE source = $1 AND person_id IS NOT NULL', [automation])) >= written);
  ok(
    '...and every one of them landed at this studio',
    (await count('SELECT count(*) n FROM outbox WHERE source = $1 AND studio_id <> $2', [automation, 'st_lumen'])) === 0,
    'the reflex names no studio; the engine supplies it',
  );
}

// ── ONE JOIN, ONE STUDIO, ONE EMAIL ──────────────────────────
//
// Both studios run "welcome somebody who joins", and both watch the same
// table. A fact once paired with reflexes by entity alone meant a person who
// joined Lumen was emailed by NORTH ROCK — over a row its reflex had never
// selected. The scope engine could not catch it and was not wrong to miss
// it: the message it wrote was legitimately North Rock's row. Only the name
// and the address inside it belonged to a competitor's member.
//
// The fact's identity — stamped by the bridge from the WRITE's own scope —
// is the fence now. This is the assertion that says so.
const soloAt = joinAt + 20 * DAY;
await runtime.db.query(`INSERT INTO people (id, email, name) VALUES ('p_solo', 'p_solo@example.com', 'Dara Vance') ON CONFLICT DO NOTHING`);

// Written down AND signed in the same breath — what an intro night's counter
// does. The join moment should greet her; the enquiry moment gets its fact
// too, re-reads the anchor through the mirrors, finds her already holding
// something, and stays quiet — two watched moments over adjacent tables.
await runtime.db.query(
  `INSERT INTO studio_people (id, studio_id, person_id, source)
   VALUES ('sp_solo', 'st_lumen', 'p_solo', 'walk-in') ON CONFLICT DO NOTHING`,
);
await runtime.db.query(
  `INSERT INTO subscriptions (id, studio_id, person_id, offering_id, status)
   VALUES ('sub_solo', 'st_lumen', 'p_solo', 'pl_lumen_eight', 'active') ON CONFLICT DO NOTHING`,
);
await tide.ingest({ kind: 'write', entity: 'studio_people', op: 'insert', row: { id: 'sp_solo', studio_id: 'st_lumen', person_id: 'p_solo' }, at: soloAt }, { as: 'automation@st_lumen' });
await tide.ingest({ kind: 'write', entity: 'subscriptions', op: 'insert', row: { id: 'sub_solo', studio_id: 'st_lumen', person_id: 'p_solo' }, at: soloAt }, { as: 'automation@st_lumen' });
for (let i = 1; i <= 5; i += 1) await tide.advance({ now: soloAt + i });

const hers = await runtime.db.query<{ studio_id: string; source: string }>(
  `SELECT studio_id, source FROM outbox WHERE person_id = 'p_solo' ORDER BY id`,
);
ok('somebody joining one studio hears from that studio', hers.rows.some((r) => r.source === 'au_lumen_welcome'), `${hers.rows.length} message(s)`);
ok(
  '...and from nobody else',
  hers.rows.every((r) => r.studio_id === 'st_lumen'),
  hers.rows.map((r) => `${r.studio_id}/${r.source}`).join(', ') || 'none',
);
ok('...exactly once — one fact, one welcome', hers.rows.filter((r) => r.source === 'au_lumen_welcome').length === 1);
ok(
  '...and the enquiry automation did not greet a member who joined',
  hers.rows.every((r) => r.source !== 'au_lumen_enquiry'),
  'its selection re-checked the mirrors and found her already holding a plan',
);

// ── the ledger survives the process ──────────────────────────
//
// Rows, in the application's own database — so `runs` is a query, and the
// screen that reads it is reading what actually happened rather than what this
// process happens to remember.
const persisted = await count(`SELECT count(*) n FROM tide_run WHERE reflex_id LIKE '${LUMEN}:%'`);
ok('the run ledger is rows in the database', persisted > 0, `${persisted} runs — a memory store starts empty every boot`);
ok('...carrying the identity each ran under', (await count(`SELECT count(*) n FROM tide_run WHERE reflex_id LIKE '${LUMEN}:%' AND as_who = 'automation@st_lumen'`)) === persisted, 'the column a scope rule matches, instead of a prefix on the id');
ok('...and no run of one studio is filed under another', (await count(`SELECT count(*) n FROM tide_run WHERE reflex_id LIKE '${LUMEN}:%' AND as_who <> 'automation@st_lumen'`)) === 0);

// ── what the automation may NOT do ───────────────────────────
const robot = 'automation@lumen.studio';
for (const [what, fingerprint, context] of [
  ['change a price', 'offerings/update', { offeringId: 'x', name: 'Free', priceCents: 0, interval: 'month', intervalCount: 1, classAllowance: '', minimumTermMonths: 0, noticeDays: 0, credits: null, validDays: null, joiningFeeId: null }],
  ['put somebody on staff', 'staff/create', { staffId: 'x', personId: 'p_ava', role: 'owner' }],
  ['check somebody in', 'check-ins/mark', { personId: 'p_ava', sessionId: 'x' }],
] as const) {
  const result = await asPrincipal(robot, '/api/automation/vex', { fingerprint, context });
  ok(`an automation cannot ${what}`, JSON.stringify(result).includes('status'), JSON.stringify(result).slice(0, 70));
}

const robotRevenue = await asPrincipal(robot, '/api/automation/vex', { fingerprint: 'studio/revenue/expected', context: {} });
ok(
  'an automation reads the sum of rows it already reads individually',
  !JSON.stringify(robotRevenue).includes('"status"'),
  'a refusal here would have been a fact about the join list, not about the rung',
);

const robotCatalog = await asPrincipal(robot, '/api/automation/vex', { fingerprint: 'automation/outbox', context: {} });
ok('an automation still reads what its rung grants', !JSON.stringify(robotCatalog).includes('"status"'), JSON.stringify(robotCatalog).slice(0, 60));

const northRobot = 'automation@northrock.gym';
const lumenNotes = await asPrincipal(robot, '/api/automation/vex', { fingerprint: 'automation/outbox', context: {} });
const rockNotes = await asPrincipal(northRobot, '/api/automation/vex', { fingerprint: 'automation/outbox', context: {} });
ok('two studios’ automations see different inboxes', JSON.stringify(lumenNotes) !== JSON.stringify(rockNotes), 'scope, not a filter either reflex wrote');
const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map((r) => String((r as { message_id?: unknown }).message_id)) : []);
const shared = idsOf(lumenNotes).filter((id) => idsOf(rockNotes).includes(id));
ok('...and the two share not one row', shared.length === 0, `${idsOf(lumenNotes).length} vs ${idsOf(rockNotes).length}, no overlap`);
ok('...each seeing only what its own studio wrote', (await count("SELECT count(*) n FROM outbox WHERE studio_id NOT IN ('st_lumen', 'st_northrock')")) === 0);

// ── THE LIVE PATH: a real write, no hand on any clock ────────
//
// Everything above drives the engine with a fake `now`. This is the loop as
// deployed: a member picks a plan on the app surface; vex commits the write
// and its observer hands moss the rows; moss mints a write fact stamped
// `automation@st_lumen` and wakes the driver; the welcome automation runs as
// the studio's own robot and queues the greeting — moments after the click,
// with nobody advancing anything.
const started = await asPrincipal('tom.vogel@example.com', '/api/me/vex', {
  fingerprint: 'subscriptions/start',
  context: { personId: 'p_tomv', offeringId: 'pl_lumen_eight', paidVia: 'manual' },
});
const startedRow = started as { id?: unknown; status?: unknown } | null;
ok('a member starts a plan on the live surface', startedRow?.status === 'active' && typeof startedRow.id === 'string', JSON.stringify(started).slice(0, 70));

// The mint is post-commit and off the response path, so give it a moment to
// land, then drain — this check drives the engine itself (world.ts stops the
// live driver, because two clocks over one ledger is two of everything), so
// what a deployment gets for free is done by hand here. The FACT is the
// claim: nobody called `fire`, and the write alone put it in the ledger.
const liveAt = soloAt + DAY;
let tomWelcomes = 0;
for (let attempt = 0; attempt < 40 && tomWelcomes === 0; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (let i = 0; i < 4; i += 1) await tide.advance({ now: liveAt + i });
  tomWelcomes = await count("SELECT count(*) n FROM outbox WHERE person_id = 'p_tomv' AND source = 'au_lumen_welcome'");
}
ok('...and the welcome automation heard the write itself', tomWelcomes === 1, `${tomWelcomes} greeting(s) — vex → fact → reflex → outbox, with nobody firing it`);
const liveFact = await runtime.db.query<{ n: number }>(
  `SELECT count(*) n FROM tide_fact WHERE kind = 'write' AND entity = 'subscriptions' AND as_who = 'automation@st_lumen' AND row->>'person_id' = 'p_tomv'`,
);
ok('...because the write itself became a fact', Number(liveFact.rows[0]?.n ?? 0) >= 1, 'minted at the vex choke point, stamped with the studio whose write it was');

// AND NOTHING ELSE DID. Every committed write in this app mints a fact; three
// (entity, op) pairs are watched. The rest — bookings, check-ins, notes, and
// the claim and the outcome this very message wrote — used to cost an awaited
// INSERT on the hot path of the click that caused them, to be read by nobody
// and swept a week later. `storeUnwatchedWrites: false` (server/tide.ts) is
// what stops that, and this is the assertion that it is switched on: the
// clause below is the whole of what this app listens to.
const strays = await runtime.db.query<{ entity: string; op: string; n: number }>(`
  SELECT entity, op, count(*) n FROM tide_fact
   WHERE kind = 'write'
     AND (entity, op) NOT IN (('subscriptions', 'insert'), ('studio_people', 'insert'), ('outbox', 'insert'))
   GROUP BY entity, op
`);
ok(
  '...and a write nothing watches minted nothing at all',
  strays.rows.length === 0,
  strays.rows.length === 0 ? 'the ledger holds what something is listening to' : JSON.stringify(strays.rows).slice(0, 120),
);

// ── AND THEN IT LEAVES THE BUILDING ──────────────────────────
//
// THE ASSERTION THIS WHOLE STACK EXISTS FOR. The queued row is itself a
// committed write, so it mints a fact of its own, and the outbox dispatcher
// wakes on that: it re-reads the row under the studio's own principal, claims
// it, composes the envelope from the studio's name and reply address, and
// hands it to the transport. Two reflexes, one chain, nobody firing anything.
//
// The transport is in its lab mode (MAIL_SINK, set at the top of this file),
// so nothing reaches a person — but everything up to the wire is the deployed
// path, including the claim that makes a retry safe.
let sent = { state: '', provider_message_id: '', failed_reason: '', sent_at: null as unknown };
for (let attempt = 0; attempt < 40 && sent.state !== 'sent'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (let i = 0; i < 4; i += 1) await tide.advance({ now: liveAt + 100 + i });
  const row = await runtime.db.query<typeof sent>(
    "SELECT state, provider_message_id, failed_reason, sent_at FROM outbox WHERE person_id = 'p_tomv' AND source = 'au_lumen_welcome'",
  );
  sent = row.rows[0] ?? sent;
}
ok('...and the message it queued was SENT', sent.state === 'sent', `${sent.state || 'nothing'} — ${sent.failed_reason || 'no reason given'}`);
ok('...with something to quote at support', sent.provider_message_id !== '', sent.provider_message_id);
// A column a plan adds and nothing writes is a column that reads NULL forever,
// and the only way that gets noticed is somebody asserting it once.
ok('...and when it went, in the row rather than in a log', sent.sent_at !== null && sent.sent_at !== undefined, String(sent.sent_at));

// A second delivery of the same fact must not produce a second email. The
// claim is what refuses it: the row is no longer `queued`, so the selection
// finds nothing and the effect never reaches the transport.
const before = await count("SELECT count(*) n FROM outbox WHERE person_id = 'p_tomv' AND state = 'sent'");
for (let i = 0; i < 6; i += 1) await tide.advance({ now: liveAt + 200 + i });
ok(
  '...once, and a re-run does not send it again',
  (await count("SELECT count(*) n FROM outbox WHERE person_id = 'p_tomv' AND state = 'sent'")) === before && before === 1,
  'the claim on the row, not a hope about delivery',
);

void CAST;
void NORTHROCK;

report('automations are principals: authored, scoped, idempotent, and previewable — and a write wakes them, not a clock.');
