// Tide check — the automations, and the identity they run as.
//
// The claim is not "a cron job worked". It is that an automation is a
// PRINCIPAL: its selection is an authored fingerprint replayed under a compiled
// charter rung, its effects are authored mutations, and the tenant boundary is
// the engine's — so Lumen's nightly job physically cannot reach a North Rock
// row, and no line of automation code is what makes that true.
//
// Time is marched, never slept on. Tide reads no clocks; every `now` below is
// supplied, which is why this whole file runs in milliseconds and gives the
// same answer on every machine.
//
// Run: pnpm --filter lyra exec tsx src/dev/tide-check.ts
import { reflexesForEveryStudio, wireTide } from '@lyra/server/tide';
import { CAST, LUMEN, NORTHROCK } from '@lyra/db/seed';
import { asPrincipal, ok, report, runtime, server } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};

// A fixed moment, so occurrence keys are the same on every run. Tide's clock
// identity is local calendar fields, so this is a date rather than an instant
// in any meaningful sense — which is exactly the property that makes a DST
// transition unable to mint or lose a firing.
const DAY = 86_400_000;
// TODAY AT NOON, not a date somebody typed once.
//
// This was a hardcoded 2026-08-08. Every row the check reads is seeded RELATIVE
// to CURRENT_DATE — sessions are generated in a window around today — so a
// fixed calendar date agrees with the data on exactly one day and drifts
// afterwards. It drifted overnight, and the failure read "2 written for 0
// bookings", which looks like a fan-out bug and was a clock disagreement.
//
// Left alone it would eventually fall outside the generated window entirely and
// the check would go quiet rather than red, which is the worse failure.
const wallClock = new Date();
const boot = Date.UTC(wallClock.getUTCFullYear(), wallClock.getUTCMonth(), wallClock.getUTCDate(), 12, 0, 0);

/** The calendar day a reflex fired at boot + offset is living in. */
const dayAt = (offset: number): string => new Date(boot + offset).toISOString().slice(0, 10);

const tide = wireTide({ server: () => server, now: () => boot });

// ── load ─────────────────────────────────────────────────────
const studios = await runtime.db.query<{ id: string; timezone: string }>('SELECT id, timezone FROM studios ORDER BY id');
// Reflexes are ROWS now, so the check reads them the way boot does — which is
// also what makes 'create an automation' a thing a studio can do at all.
const automationRows = await runtime.db.query('SELECT id, studio_id, audience, effect, enabled, run_at, trial_days, subject, body FROM automations');
const reflexes = reflexesForEveryStudio(studios.rows, automationRows.rows as never);
// The derived digest — one per studio that lapses trials. It is not configured:
// it watches whichever row does the lapsing, so it follows the composition
// instead of naming a template id that rows no longer have.
const derivedDigests = new Set(
  (automationRows.rows as { studio_id: string; effect: string; enabled: boolean }[])
    .filter((r) => r.effect === 'trial.lapse' && r.enabled)
    .map((r) => r.studio_id),
).size;
const loaded = await tide.load(reflexes, { at: boot });

// NOT the same reflexes any more, and that is exactly the change: a studio’s
// automations are its own rows, so Lumen runs three and North Rock two. A
// count expecting them to match was asserting the old world, where every
// studio got whatever happened to be hardcoded.
ok(
  'each studio runs its own automations',
  // Rows PLUS the derived digest — one per studio that lapses trials. The
  // digest is not configured; it watches whichever row does the lapsing, so it
  // follows the composition instead of naming an id rows no longer have.
  reflexes.length === automationRows.rows.length + derivedDigests,
  `${reflexes.length} reflexes from ${automationRows.rows.length} rows plus ${derivedDigests} derived digest(s)`,
);
ok(
  '...and they differ per studio',
  reflexes.filter((r) => r.id.startsWith(LUMEN)).length !== reflexes.filter((r) => r.id.startsWith(NORTHROCK)).length,
  'three at Lumen, two at North Rock — which a studio can now change itself',
);
ok('...and they all load', loaded.loaded === reflexes.length, JSON.stringify(loaded.warnings ?? []).slice(0, 90));
ok('...with no cycles in the graph', (loaded.cycles?.length ?? 0) === 0);

// Load verifies effects exist. A reflex naming a mutation this app cannot
// write is refused here rather than at 3am.
const bogus = await tide
  .load([{ ...reflexes[0]!, id: 'bogus', effect: { name: 'automation/pay-everybody', input: {} } }], { at: boot })
  .then(() => 'accepted')
  .catch((error: unknown) => String(error));
ok('an effect the app cannot write is refused at load', bogus !== 'accepted', String(bogus).slice(0, 90));

// ── preview: the dry run that costs nothing ──────────────────
//
// The authoring loop's inner verb. It runs the REAL pipeline — real selection,
// real templates — and stubs exactly one function, the effect executor. A
// reflex cannot opt out of being previewable, which is what makes it possible
// to show a studio owner what tonight would do.
// The reflex id is the ROW id now, not a template name: two automations can
// share a pairing with different windows, so the row is what identifies one.
const lumenLapse = `${LUMEN}:au_lumen_lapse`;
const trialsBefore = await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_lumen' AND status = 'trialling'");

const preview = await tide.preview(lumenLapse, { now: boot });
ok('a reflex previews against real data', preview !== undefined);
// Nothing is due AT BOOT — Lena is 9 days into a 14-day window — and a dry
// run that reported work anyway would be the more alarming result.
ok('...selecting nothing, because nothing is due yet', JSON.stringify(preview).includes('"selected":0'), 'Lena is 9 days into a 14-day window');

// Six days on she is 15 days in, and the same preview says so — same reflex,
// same data, different logical now. This is the assertion that proves the
// window is computed from the tick rather than from a wall clock.
const previewLater = await tide.preview(lumenLapse, { now: boot + 6 * DAY });
ok('...and finding her once the window is up', JSON.stringify(previewLater).includes('Lena'), JSON.stringify(previewLater).slice(0, 90));
ok('...and writes nothing', (await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_lumen' AND status = 'trialling'")) === trialsBefore, 'a dry run that changed data would not be a dry run');

// ── firing it ────────────────────────────────────────────────
//
// `fire` mints a manual fact aimed at one reflex. Lena is 9 days in and the
// window is 14, so nothing is due yet — and "zero rows" is an ordinary
// outcome, not an error.
await tide.fire(lumenLapse, { now: boot, by: 'tide-check' });
await tide.tick({ now: boot });
ok('nothing lapses before the window is up', (await count("SELECT count(*) n FROM memberships WHERE id = 'mb_lena' AND status = 'trialling'")) === 1);

// Six days later, Lena is 15 days in.
const later = boot + 6 * DAY;
await tide.fire(lumenLapse, { now: later, by: 'tide-check' });
await tide.tick({ now: later });
await tide.tick({ now: later });

ok('a trial past its window lapses', (await count("SELECT count(*) n FROM memberships WHERE id = 'mb_lena' AND status = 'lapsed'")) === 1);
ok('...and the row is otherwise untouched', (await count("SELECT count(*) n FROM memberships WHERE id = 'mb_lena' AND notes <> ''")) === 1, 'an automation that rewrote the desk’s notes would destroy evidence');
ok('...and nobody else moved', (await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_lumen' AND status = 'active'")) >= 3);

// THE TENANT BOUNDARY. North Rock has its own trialling member, and Lumen's
// reflex ran with `studio_id` pinned by the engine — not by a WHERE anybody
// wrote in the reflex, which contains no studio id at all.
ok('a competitor’s trials are untouched', (await count("SELECT count(*) n FROM memberships WHERE studio_id = 'st_northrock' AND status = 'trialling'")) >= 1, 'the reflex names no studio; the engine supplies it');

// ── idempotency ──────────────────────────────────────────────
//
// The task row is keyed `(reflex, cause, unit)` and written BEFORE the effect,
// so there is no path to the effect that skips it. Re-firing the same work must
// not lapse anybody a second time — and the WRITE re-checks `trialling` in its
// own WHERE, so even a replayed task is a no-op against a reactivated member.
await runtime.db.query("UPDATE memberships SET status = 'active' WHERE id = 'mb_lena'");
await tide.tick({ now: later });
ok('a settled firing does not run again', (await count("SELECT count(*) n FROM memberships WHERE id = 'mb_lena' AND status = 'active'")) === 1, 'idempotent by task key, and guarded by the statement');

// ── fan-in: the digest ───────────────────────────────────────
//
// A settled firing mints a fact carrying its stats, so the digest is an
// ordinary reflex watching an ordinary fact. It cannot run before the work,
// because the fact it waits on does not exist until the work settles.
for (let i = 0; i < 4; i += 1) await tide.tick({ now: later + i });

const digests = await count("SELECT count(*) n FROM notifications WHERE kind = 'digest' AND studio_id = 'st_lumen'");
ok('a settled firing feeds the digest', digests >= 1, `${digests} written — fan-in with no callback and no shared state`);
ok('...and it is addressed to the studio, not a person', (await count("SELECT count(*) n FROM notifications WHERE kind = 'digest' AND person_id IS NULL")) >= 1);
ok('...stamped with the studio by the engine', (await count("SELECT count(*) n FROM notifications WHERE kind = 'digest' AND studio_id = 'st_lumen'")) >= 1, 'the reflex input carries no studio id');

// ── fan-out: one task per person ─────────────────────────────
const lumenRemind = `${LUMEN}:au_lumen_remind`;
// FIRE ON A DAY THAT HAS WORK, chosen from the data.
//
// This fired at boot + one day and counted bookings at boot + two, which asserts
// the fan-out only when the seed happens to have put a class two days out. The
// seed is a WEEKLY grid, so that depends on which weekday the check runs — it
// held for months and then a Tuesday came round with nothing on it and the
// check said "a fan-out of zero would assert nothing", which is true and is not
// a bug in the product.
//
// A check for "one task per person" has to pick a day with people on it. The
// day comes from the database; the firing time is derived backwards from it, so
// the reflex's own "tomorrow" lands exactly there.
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

// One day before the target, at noon — so the reflex's "now + 1 day" is the day
// the bookings are actually on.
const fireAt = Date.parse(`${targetDay}T12:00:00Z`) - DAY;
await tide.fire(lumenRemind, { now: fireAt, by: 'tide-check' });
for (let i = 0; i < 4; i += 1) await tide.tick({ now: fireAt + i });

const reminders = await count("SELECT count(*) n FROM notifications WHERE kind = 'studio-message' AND studio_id = 'st_lumen'");
ok('a reminder per booking, not one for the batch', reminders === due, `${reminders} written for ${due} bookings — each retries independently`);
ok('...and there was work to fan out', due > 0, `${due} on ${targetDay} — a fan-out of zero would assert nothing`);
if (due > 0) {
  // THE STUDIO'S OWN WORDS. The subject used to be a sentence I wrote —
  // "Tomorrow: <class> at <time>" — which meant every studio on the platform
  // sent the same message and none of them could change it. It is a column
  // now, and this asserts the studio's text actually reaches the member.
  ok('...in the studio’s own words', (await count("SELECT count(*) n FROM notifications WHERE kind = 'studio-message' AND subject = 'See you tomorrow'")) === reminders, 'authored on the row, not hardcoded in a shape');
  // And the facts that only the row knows are still appended, so composing a
  // message did not cost the detail the hardcoded version had.
  ok('...still naming the class and time', (await count("SELECT count(*) n FROM notifications WHERE kind = 'studio-message' AND body LIKE '%(%at%)'")) === reminders);
  ok('...and addressed to the person booked', (await count("SELECT count(*) n FROM notifications WHERE kind = 'studio-message' AND person_id IS NOT NULL")) === reminders);
}

// ── what the automation may NOT do ───────────────────────────
//
// The rung is narrow on purpose. An automation that extended `owner` would
// have every verb it might ever want, which is the temptation this refuses.
const robot = 'automation@lumen.studio';
for (const [what, fingerprint, context] of [
  ['change a price', 'plans/update', { planId: 'x', name: 'Free', priceCents: 0, interval: 'month', classAllowance: '' }],
  ['put somebody on staff', 'staff/create', { staffId: 'x', personId: 'p_ava', role: 'owner' }],
  ['check somebody in', 'check-ins/mark', { membershipId: 'mb_ava', sessionId: 'x' }],
] as const) {
  const result = await asPrincipal(robot, '/api/automation/vex', { fingerprint, context });
  ok(`an automation cannot ${what}`, JSON.stringify(result).includes('status'), JSON.stringify(result).slice(0, 70));
}

// ONE REFUSAL LEFT THIS LIST, and it is worth saying why rather than quietly
// dropping it. "An automation cannot read the takings" used to pass, and it
// passed BY ACCIDENT: the revenue read joined `plans`, which this rung does not
// hold, so it bounced on a table rather than on a decision. The read is a sum
// over `subscriptions` now — one table, which this rung DOES hold, because
// "whose subscription ends this month" is a job it was given.
//
// So the sum is derivable from rows it already reads one at a time, exactly as
// attendance reports are derivable for the desk. Asserting a refusal here would
// be asserting the shape of a query rather than the shape of a policy, and the
// next join added anywhere would flip it again.
//
// What IS a boundary for this rung is above: it cannot change a price, cannot
// put somebody on staff, and cannot mark an attendance. Those are verbs it was
// never issued, and no query shape can give them back.
const robotRevenue = await asPrincipal(robot, '/api/automation/vex', { fingerprint: 'studio/revenue/expected', context: {} });
ok(
  'an automation reads the sum of rows it already reads individually',
  !JSON.stringify(robotRevenue).includes('"status"'),
  'a refusal here would have been a fact about the join list, not about the rung',
);

// And it holds no application at all — no shell, no nav, no screen. Ring 1
// resolving to nothing is the right answer for something that never logs in.
const robotCatalog = await asPrincipal(robot, '/api/automation/vex', { fingerprint: 'automation/notifications', context: {} });
ok('an automation still reads what its rung grants', !JSON.stringify(robotCatalog).includes('"status"'), JSON.stringify(robotCatalog).slice(0, 60));

// Cross-tenant, through the raw surface rather than through a reflex — the
// same assertion the tenancy check makes for people, made for robots.
const northRobot = 'automation@northrock.gym';
const lumenNotes = await asPrincipal(robot, '/api/automation/vex', { fingerprint: 'automation/notifications', context: {} });
const rockNotes = await asPrincipal(northRobot, '/api/automation/vex', { fingerprint: 'automation/notifications', context: {} });
ok('two studios’ automations see different inboxes', JSON.stringify(lumenNotes) !== JSON.stringify(rockNotes), 'scope, not a filter either reflex wrote');
// North Rock's inbox is NOT empty, and that is correct rather than a leak: a
// tick materializes every armed clock occurrence, so both studios' nightly work
// ran. What matters is that neither inbox contains a row belonging to the
// other — asserted on ids, which cannot coincide.
const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map((r) => String((r as { notification_id?: unknown }).notification_id)) : []);
const shared = idsOf(lumenNotes).filter((id) => idsOf(rockNotes).includes(id));
ok('...and the two share not one row', shared.length === 0, `${idsOf(lumenNotes).length} vs ${idsOf(rockNotes).length}, no overlap`);
ok('...each seeing only what its own studio wrote', (await count("SELECT count(*) n FROM notifications WHERE studio_id NOT IN ('st_lumen', 'st_northrock')")) === 0);

void CAST;
void NORTHROCK;

report('automations are principals: authored, scoped, idempotent, and previewable.');
