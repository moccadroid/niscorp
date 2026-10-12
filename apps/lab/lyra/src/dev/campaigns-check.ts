process.env['MAIL_SINK'] = 'log';
// The seed is set because marketing mail with no working opt-out is refused at dispatch.
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

await runtime.db.query(
  "UPDATE studio_people SET marketing_ok = true, trial_ends_on = studio_today($1) + 14 WHERE person_id = 'p_emma' AND studio_id = $1",
  [LUMEN],
);
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

// The window is an offset from the studio's today, because the seed builds its
// sessions relative to today. Seven days is inside both of the seed's authored
// silences: Jonas stopped three weeks back and never opted in, so the sheet
// names him; Sofia stopped ten days back and did, so the automation finds her.
const SINCE = (await rows<{ d: string }>('SELECT (studio_today($1) - 7)::text AS d', [LUMEN]))[0]?.d ?? '';
const CUTOFF = { audience: 'quiet', cutoff: SINCE };
const quietPage = (await ask('campaigns/audience-page', CUTOFF)) as { person_id: string; disposition: string }[];
const quietAutomation = (await asMachinery('automation/not-seen-since', { cutoff: CUTOFF.cutoff })) as unknown[];

const optedOut = quietPage.filter((p) => p.disposition === 'no_consent');
ok(
  'the compose sheet names who will not be written to, and why',
  optedOut.length > 0,
  optedOut.map((p) => `${p.person_id}: ${p.disposition}`).join(', ') || 'nobody was named',
);
ok(
  '...while the automation over the same people drops them, as it should',
  Array.isArray(quietAutomation) && quietAutomation.length > 0 && quietAutomation.length === quietPage.length - optedOut.length,
  `${quietPage.length} answered, ${optedOut.length} unwritable, ${(quietAutomation as unknown[]).length} selected by the automation`,
);
ok(
  '...and no address ever reaches the sheet',
  quietPage.every((p) => !JSON.stringify(p).includes('@')),
  'a list of first names has no business carrying a studio’s mailing list',
);

const AUDIENCE = { audience: 'roll/current', audienceDays: 0 };
const question = { audience: AUDIENCE.audience, cutoff: SINCE };
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

// Replayed as the machinery itself, because the reflex would refuse a second
// time on its selection (`state = 'sending'`): the index under it is what is tested.
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

ok(
  'the recipient read declares its own page size rather than inheriting one',
  campaignAudienceResolve.dsl.limit === RESOLVE_PAGE,
  `limit ${String(campaignAudienceResolve.dsl.limit)} — an unauthored limit is 100, silently`,
);

const firstPage = (await asMachinery('campaigns/audience-resolve', { audience: AUDIENCE.audience, cutoff: SINCE })) as { person_id: string }[];
const seeked = (await asMachinery('campaigns/audience-resolve', {
  audience: AUDIENCE.audience,
  cutoff: SINCE,
  after: firstPage[0]?.person_id ?? '',
})) as { person_id: string }[];

ok(
  '...and the fan-out can walk past the end of a page',
  seeked.length === firstPage.length - 1 && !seeked.some((r) => r.person_id === firstPage[0]?.person_id),
  `${firstPage.length} then ${seeked.length} after seeking past ${firstPage[0]?.person_id ?? '—'} — the cursor is the sort key, so it cannot skip or repeat`,
);

const struck = queued[0]?.person_id ?? '';
const second = await send({ ...AUDIENCE, excluded: [struck], subject: 'Not for you', body: 'One sentence.' });
ok(
  'unticking somebody is subtraction from the question',
  (await count('SELECT count(*) n FROM outbox WHERE campaign_id = $1 AND person_id = $2', [second, struck])) === 0 &&
    (await count('SELECT count(*) n FROM outbox WHERE campaign_id = $1', [second])) === queued.length - 1,
  `${struck} left out, ${queued.length - 1} written to`,
);

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
