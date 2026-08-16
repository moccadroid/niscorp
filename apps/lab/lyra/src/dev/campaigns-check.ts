// Run: pnpm --filter lyra exec tsx src/dev/campaigns-check.ts
//
// THE STUDIO WRITES TO ITS PEOPLE.
//
// One decision by a human — a question, three sentences, a button — becomes
// one message per person it honestly reaches, through the mail door that
// already existed. The claims, in the order they would break:
//
//   1. THE PARTITION ANSWERS RATHER THAN FILTERS. An automation is right to
//      select nobody it cannot write to. A compose sheet is not: "39 will be
//      written to, 2 have opted out" is a sentence a query that already
//      dropped the two cannot say. Both behaviours ship, over the same people.
//   2. THE NUMBER ON THE BUTTON IS THE NUMBER THAT GOES. Counted through the
//      filter the write uses, not through a tally of the screen's reasoning.
//   3. ONE DECISION, ONE ROW PER PERSON, and the child's addressed to an adult.
//   4. TWICE IS ONCE. The fan-out is a task, tasks retry, and the index is
//      what makes a retry cost nobody a second copy.
//   5. UNTICKING SOMEBODY LEAVES THEM OUT — subtraction from a question.
//   6. THE CEILING REFUSES THE WHOLE CAMPAIGN, with the number in words. Half
//      a newsletter is worse than none.
//   7. NO HUMAN WRITES `outbox`. The charter's sentence, tested rather than
//      trusted — it is what the whole reflex design exists to keep true.
process.env['MAIL_SINK'] = 'log';
// Set HERE rather than read from a developer's .env, and the seed matters:
// marketing mail with no working opt-out is refused at dispatch, so a check
// without one would assert against rows that failed for the wrong reason.
process.env['LYRA_SIGNING_SEED'] = 'campaigns-check-seed';
process.env['MAIL_FROM_DOMAIN'] = 'mail.lyra.test';

import { mintDevToken } from '@niscorp/moss';
import { CAST } from '@lyra/db/seed';
import { RESOLVE_PAGE, campaignAudienceResolve } from '@lyra/app/vex/campaign.entries';
import { asPrincipal, ok, report, runtime, server, settle } from './world';

const LUMEN = CAST.lumen.studio;
const OWNER = CAST.lumen.owner;

const rows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await runtime.db.query<T>(sql, params)).rows as T[];
const count = async (sql: string, params: unknown[] = []): Promise<number> => Number((await rows<{ n: string }>(sql, params))[0]?.n ?? -1);

/** As the studio's own machinery, exactly as the fan-out effect does it —
 *  same principal, same surface, same compiled scope policy. Asking as the
 *  owner instead would answer happily and prove nothing about the rung the
 *  reflex actually runs on. */
const asMachinery = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
  const response = await server.request('/api/automation/vex', {
    method: 'POST',
    headers: { authorization: `Bearer ${mintDevToken(`automation@${LUMEN}`)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint, context }),
  });
  if (!response.ok) return { status: response.status };
  return ((await response.json()) as { result?: unknown }).result;
};

const ask = (fingerprint: string, context: Record<string, unknown>): Promise<unknown> =>
  asPrincipal(OWNER, '/api/campaigns/vex', { fingerprint, context });

/** Press Send, and let the studio's own machinery do what it does. */
const send = async (context: Record<string, unknown>): Promise<string> => {
  const created = (await ask('campaigns/create', context)) as { id?: unknown };
  await settle(20);
  return String(created?.id ?? '');
};

const stateOf = async (id: string): Promise<{ state: string; queued_count: number; refused_reason: string; sent_at: string | null }> =>
  (await rows<{ state: string; queued_count: number; refused_reason: string; sent_at: string | null }>(
    'SELECT state, queued_count, refused_reason, sent_at FROM campaigns WHERE id = $1',
    [id],
  ))[0] ?? { state: '', queued_count: -1, refused_reason: '', sent_at: null };

// ── arrange ──────────────────────────────────────────────────
//
// A child ON TRIAL, which is the ordinary way a seven-year-old appears at a
// studio: a parent brings them to try a class. Consent is the guardian's,
// recorded on the child's anchor, and the child has no address of their own —
// so where their mail goes is the mirror's answer, not this check's.
await runtime.db.query(
  "UPDATE studio_people SET marketing_ok = true, trial_ends_on = studio_today($1) + 14 WHERE person_id = 'p_emma' AND studio_id = $1",
  [LUMEN],
);
// Somebody the provider has already told us about. A complaint is a fact about
// a RELATIONSHIP, so it carries this studio's id — suppressing them everywhere
// would punish a studio they never complained about.
await runtime.db.query(
  "INSERT INTO mail_suppressions (address, studio_id, kind, reason) VALUES ('sofia.reyes@example.com', $1, 'complained', 'reported us') ON CONFLICT DO NOTHING",
  [LUMEN],
);

const emma = await rows<{ mail_to: string }>("SELECT mail_to FROM studio_people WHERE person_id = 'p_emma' AND studio_id = $1", [LUMEN]);
ok(
  'a child on trial has no address of their own, and a route to an adult',
  emma[0]?.mail_to === 'ava.klein@example.com',
  `${emma[0]?.mail_to} — the anchor's mirror, resynced by trigger, not a rule this check applied`,
);

// ── 1. answered, not filtered ────────────────────────────────
//
// THE GAP THIS FEATURE OPENED WITH. `automation/not-seen-since` filters
// consent and reachability INSIDE the selection — correctly, because an
// unsendable automation message is a message that should never exist, and
// because a consent test outside the read is a test vex cannot invalidate a
// cache on. Run over the same people, the campaign's question must answer
// where the automation's drops.
const CUTOFF = { audience: 'quiet', cutoff: '2026-08-14' };
const quietPage = (await ask('campaigns/audience-page', CUTOFF)) as { person_id: string; disposition: string; reason_display: string }[];
const quietAutomation = (await asMachinery('automation/not-seen-since', { cutoff: CUTOFF.cutoff })) as unknown[];

const optedOut = quietPage.filter((p) => p.disposition === 'no_consent');
ok(
  'the compose sheet names who will not be written to, and why',
  optedOut.length > 0 && optedOut.every((p) => p.reason_display !== ''),
  optedOut.map((p) => `${p.person_id}: ${p.reason_display}`).join(', ') || 'nobody was named',
);
ok(
  '...while the automation over the same people drops them, as it should',
  Array.isArray(quietAutomation) && quietAutomation.length === quietPage.length - optedOut.length,
  `${quietPage.length} answered, ${optedOut.length} unwritable, ${(quietAutomation as unknown[]).length} selected by the automation`,
);
ok(
  '...and no address ever reaches the sheet',
  quietPage.every((p) => !JSON.stringify(p).includes('@')),
  'a list of first names has no business carrying a studio’s mailing list',
);

// ── 2. the number on the button ──────────────────────────────
const AUDIENCE = { audience: 'roll/current', audienceDays: 0 };
const question = { audience: AUDIENCE.audience, cutoff: '2026-08-14' };
const total = (await ask('campaigns/audience-count', question)) as { total: number };
const writable = (await ask('campaigns/audience-writable', question)) as { ok: number };
const page = (await ask('campaigns/audience-page', question)) as { person_id: string; disposition: string }[];

ok(
  'the sheet says how many are in the list, and how many will be written to',
  total.total > writable.ok && writable.ok > 0,
  `${total.total} in this list, ${writable.ok} will be written to`,
);
ok(
  '...and the two agree with the dispositions beside the names',
  page.filter((p) => p.disposition === 'ok').length === writable.ok && page.length === total.total,
  `${page.filter((p) => p.disposition === 'ok').length} ok of ${page.length} named`,
);
ok(
  '...including the one the provider told us about',
  page.some((p) => p.person_id === 'p_sofia' && p.disposition === 'suppressed'),
  'a complaint is answered on the sheet, not discovered in the outbox',
);

// ── 3. one decision, one row per person ──────────────────────
const before = await count('SELECT count(*) n FROM outbox');
const first = await send({ ...AUDIENCE, excluded: [], subject: 'Winter term starts Monday', body: 'Three sentences, and a warm one.' });
const queued = await rows<{ person_id: string; to_address: string; marketing: boolean; campaign_id: string }>(
  'SELECT person_id, to_address, marketing, campaign_id FROM outbox WHERE campaign_id = $1 ORDER BY person_id',
  [first],
);

ok(
  'pressing Send writes one campaign, and machinery turns it into mail',
  queued.length === writable.ok,
  `${queued.length} messages for ${writable.ok} writable people — the button wrote none of them`,
);
ok(
  '...every one of them marketing, and carrying its campaign',
  queued.every((r) => r.marketing === true && r.campaign_id === first),
  'the unsubscribe footer and the List-Unsubscribe headers ride a flag that already existed',
);
ok(
  '...and nobody unwritable got one',
  queued.every((r) => page.find((p) => p.person_id === r.person_id)?.disposition === 'ok'),
  'the write enforces what the sheet advised, through the same filter',
);

const settled = await stateOf(first);
ok(
  '...and the campaign says what became of it',
  settled.state === 'sent' && settled.queued_count === queued.length && settled.sent_at !== null,
  `${settled.state}, ${settled.queued_count} queued`,
);

// ── 4. the child's mail reached an adult ─────────────────────
const child = queued.find((r) => r.person_id === 'p_emma');
ok(
  'a child’s campaign mail is addressed to their guardian',
  child !== undefined && child.to_address === 'ava.klein@example.com',
  child === undefined ? 'the child got no message at all' : `${child.person_id} → ${child.to_address}`,
);
ok(
  '...and it is still the CHILD’s message, not a second one for the adult',
  queued.filter((r) => r.to_address === 'ava.klein@example.com').length === 2 && queued.some((r) => r.person_id === 'p_ava'),
  'two rows, two people, one address — who it is ABOUT and where it GOES are different facts',
);

// ── 5. twice is once ─────────────────────────────────────────
//
// The fan-out is a task and tasks retry; a process that dies between writing
// the messages and stamping the campaign runs the statement again. Replayed
// here as the machinery itself, because the reflex would refuse a second time
// on the selection (`state = 'sending'`) and prove the wrong thing — what is
// being tested is the INDEX under it.
const replay = await asMachinery('campaigns/fan-out', {
  recipients: queued.map((r) => ({ person_id: r.person_id, to_address: r.to_address })),
  campaignId: first,
  subject: 'Winter term starts Monday',
  body: 'Three sentences, and a warm one.',
  source: 'campaign',
});
ok(
  'running the fan-out twice writes nothing the second time',
  (await count('SELECT count(*) n FROM outbox WHERE campaign_id = $1', [first])) === queued.length,
  `still ${queued.length} — ON CONFLICT DO NOTHING against outbox_campaign_person, and it answered ${JSON.stringify(replay).slice(0, 40)}`,
);

// ── 5b. the read that decides who receives cannot be truncated ──
//
// THE BUG THIS PINS SHIPPED ONCE. Every read in this engine gets a limit
// whether it authors one or not — the pipeline gives a limitless DSL 100 —
// and on the one read that decides who receives mail that is not a smaller
// right answer: the hundred-and-first member is never written to and the
// campaign row stamps itself `sent`. A seeded studio of fifteen people can
// never notice, which is exactly why this is asserted on the ENTRY rather
// than on an outcome.
ok(
  'the recipient read declares its own page size rather than inheriting one',
  campaignAudienceResolve.dsl.limit === RESOLVE_PAGE,
  `limit ${String(campaignAudienceResolve.dsl.limit)} — an unauthored limit is 100, silently`,
);

const firstPage = (await asMachinery('campaigns/audience-resolve', { audience: AUDIENCE.audience, cutoff: '2026-08-14' })) as { person_id: string }[];
const seeked = (await asMachinery('campaigns/audience-resolve', {
  audience: AUDIENCE.audience,
  cutoff: '2026-08-14',
  after: firstPage[0]?.person_id ?? '',
})) as { person_id: string }[];

ok(
  '...and the fan-out can walk past the end of a page',
  seeked.length === firstPage.length - 1 && !seeked.some((r) => r.person_id === firstPage[0]?.person_id),
  `${firstPage.length} then ${seeked.length} after seeking past ${firstPage[0]?.person_id ?? '—'} — the cursor is the sort key, so it cannot skip or repeat`,
);

// ── 6. unticking somebody leaves them out ────────────────────
const struck = queued[0]?.person_id ?? '';
const second = await send({ ...AUDIENCE, excluded: [struck], subject: 'Not for you', body: 'One sentence.' });
ok(
  'unticking somebody is subtraction from the question',
  (await count('SELECT count(*) n FROM outbox WHERE campaign_id = $1 AND person_id = $2', [second, struck])) === 0 &&
    (await count('SELECT count(*) n FROM outbox WHERE campaign_id = $1', [second])) === queued.length - 1,
  `${struck} left out, ${queued.length - 1} written to`,
);

// ── 7. the ceiling refuses the whole campaign ────────────────
//
// Dispatch fails a capped message rather than deferring it — right for a
// reminder about tomorrow's class, wrong for a newsletter that would go half
// out. So the fan-out asks BEFORE it writes anything.
const used = await count("SELECT count(*) n FROM outbox WHERE studio_id = $1 AND created_on = CURRENT_DATE AND state IN ('queued','sending','sent')", [LUMEN]);
await runtime.db.query('UPDATE studios SET daily_mail_cap = $2 WHERE id = $1', [LUMEN, used + 1]);
const capped = await send({ ...AUDIENCE, excluded: [], subject: 'Too many', body: 'One sentence.' });
const refused = await stateOf(capped);

ok(
  'a campaign that will not fit under the day’s ceiling is refused whole',
  refused.state === 'refused' && (await count('SELECT count(*) n FROM outbox WHERE campaign_id = $1', [capped])) === 0,
  `${refused.state} — half a newsletter is worse than none`,
);
ok(
  '...and says so with the numbers in it',
  /\d/.test(refused.refused_reason) && refused.refused_reason.includes('room for'),
  refused.refused_reason || 'no reason recorded',
);
await runtime.db.query('UPDATE studios SET daily_mail_cap = 1000 WHERE id = $1', [LUMEN]);

// ── 8. no human writes the outbox ────────────────────────────
//
// The sentence the automation rung's `outbox.write.update` grant is justified
// by (charter.ts), and the reason a campaign is a row rather than a loop that
// queues mail. If this ever passes, that paragraph is a lie and the claim,
// the cap, the suppression list and the sweep have stopped applying to the
// highest-volume mail in the product.
const smuggled = (await asPrincipal(OWNER, '/api/campaigns/vex', {
  fingerprint: 'automation/queue-message',
  context: { personId: 'p_ava', toAddress: 'ava.klein@example.com', subject: 'By hand', body: 'x', source: 'by-hand', marketing: true },
})) as { status?: number };

ok(
  'an owner cannot queue mail directly, however they ask',
  smuggled?.status !== undefined && smuggled.status >= 400,
  `refused with ${smuggled?.status ?? 'a row'} — every message in this product is an automation's own`,
);

const afterAll = await count('SELECT count(*) n FROM outbox');
ok(
  '...and every message this check produced came through one door',
  afterAll - before === queued.length + (queued.length - 1),
  `${afterAll - before} rows, all of them queued by machinery reading a campaign`,
);

report('campaigns');
