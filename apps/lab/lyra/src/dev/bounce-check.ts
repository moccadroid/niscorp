// Run: pnpm --filter lyra exec tsx src/dev/bounce-check.ts
//
// WHAT HAPPENED AFTER WE HANDED IT OVER — and why "Sent" was not enough.
//
// A 200 from the provider means ACCEPTED. It was proven the hard way against
// the real API: a message went out from a sender the sandbox had every reason
// to refuse, came back with an id, and arrived. Nothing after that point can
// be known without the provider telling us — so this door, and the list it
// writes, are the only things that make the word on a studio's screen true.
//
// The signature is the whole authentication: a vendor calling in has no
// session and could not have one. So the claims here are a forger's: tamper
// with the body, replay an old one, guess.
process.env['MAIL_HOOK_SECRET'] = 'whsec_dGhpcyBpcyBhIHRlc3Qgc2lnbmluZyBrZXkh';

import { createHmac } from 'node:crypto';
import { ok, report, runtime, server } from './world';

const SECRET = 'whsec_dGhpcyBpcyBhIHRlc3Qgc2lnbmluZyBrZXkh';
const MESSAGE = 'pm_bounce_probe';
const ADDRESS = 'gone.away@example.com';

// Signed exactly as Svix does it: `id.timestamp.body`, HMAC-SHA256, keyed on
// the secret with `whsec_` stripped and the rest base64 DECODED.
const deliver = async (body: unknown, options: { at?: number; tamper?: boolean } = {}): Promise<number> => {
  const raw = JSON.stringify(body);
  const id = 'msg_2abc';
  const timestamp = String(Math.floor((options.at ?? Date.now()) / 1000));
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  const response = await server.request('/api/mail/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
    // A tampered body keeps the signature it was NOT computed over — the exact
    // shape of an attacker editing a payload in flight.
    body: options.tamper === true ? `${raw} ` : raw,
  });
  return response.status;
};

const suppressions = async (): Promise<number> => {
  const r = await runtime.db.query<{ n: number }>('SELECT count(*) n FROM mail_suppressions');
  return Number(r.rows[0]?.n ?? -1);
};
const stateOf = async (): Promise<{ state: string; failed_reason: string; delivered_at: unknown }> => {
  const r = await runtime.db.query<{ state: string; failed_reason: string; delivered_at: unknown }>(
    'SELECT state, failed_reason, delivered_at FROM outbox WHERE provider_message_id = $1',
    [MESSAGE],
  );
  return r.rows[0] ?? { state: '', failed_reason: '', delivered_at: null };
};

await runtime.db.query(
  `INSERT INTO outbox (studio_id, person_id, to_address, subject, state, provider_message_id, marketing)
   VALUES ('st_lumen', 'p_ava', $1, 'Probe', 'sent', $2, true)`,
  [ADDRESS, MESSAGE],
);

const bounce = { type: 'email.bounced', data: { email_id: MESSAGE, to: [ADDRESS], bounce: { message: 'Recipient address does not exist' } } };

// ── the ones that are not the provider ───────────────────────
ok('a tampered body is not an event', (await deliver(bounce, { tamper: true })) === 200 && (await suppressions()) === 0, 'signed over the RAW body, so a trailing space is a different message');
ok('...and neither is a replay from an hour ago', (await deliver(bounce, { at: Date.now() - 3_600_000 })) === 200 && (await suppressions()) === 0, 'a signature is valid forever; a recording of one request IS that request');
ok(
  '...and both answer 200 rather than arguing',
  true,
  'a 4xx tells a webhook sender to retry all night — nothing happened, and nothing needs saying about it',
);

// ── the real thing ───────────────────────────────────────────
ok('a signed bounce is heard', (await deliver(bounce)) === 200 && (await suppressions()) === 1, 'the signature is the whole authentication');
const bounced = await stateOf();
ok('...and the row stops claiming it was sent', bounced.state === 'failed', `${bounced.state} — "${bounced.failed_reason}"`);

const scope = await runtime.db.query<{ studio_id: string; kind: string }>('SELECT studio_id, kind FROM mail_suppressions');
ok(
  '...and a dead address is suppressed everywhere, not just here',
  scope.rows[0]?.studio_id === '' && scope.rows[0]?.kind === 'bounced',
  'the address does not exist — that is not a fact about one studio',
);

// A COMPLAINT IS ABOUT THE RELATIONSHIP. Suppressing them everywhere would
// punish studios they never complained about, and withdrawing consent is the
// honest reading of somebody pressing "spam".
await runtime.db.query("UPDATE mail_suppressions SET studio_id = 'x' WHERE address = $1", [ADDRESS]);
await runtime.db.query("UPDATE studio_people SET marketing_ok = true WHERE person_id = 'p_ava' AND studio_id = 'st_lumen'");
await deliver({ type: 'email.complained', data: { email_id: MESSAGE, to: [ADDRESS] } });
const scoped = await runtime.db.query<{ studio_id: string }>('SELECT studio_id FROM mail_suppressions WHERE kind = $1', ['complained']);
ok('a complaint is suppressed at the studio complained about', scoped.rows[0]?.studio_id === 'st_lumen', 'not everywhere — they did not complain about everybody');
const consent = await runtime.db.query<{ marketing_ok: boolean }>("SELECT marketing_ok FROM studio_people WHERE person_id = 'p_ava' AND studio_id = 'st_lumen'");
ok('...and takes their consent with it', consent.rows[0]?.marketing_ok === false, 'pressing "spam" withdraws permission whatever a checkbox says');

// ── delivered is a different fact from sent ──────────────────
await deliver({ type: 'email.delivered', data: { email_id: MESSAGE, to: [ADDRESS] } });
ok('a delivery is recorded where it can be answered from', (await stateOf()).delivered_at !== null, 'a column, not a fifth state — the screen keeps its words until somebody chooses new ones');

// ── THE NET UNDER THE DISPATCHER ─────────────────────────────
//
// A message whose process died mid-send leaves a row saying `sending` that no
// state can tell apart from one genuinely in flight. The claim takes it back
// once it is old enough — which is the only thing that can, and the reason
// `claimed_at` is written by the claiming statement itself.
process.env['MAIL_SINK'] = 'log';
const { STUCK_AFTER_MS } = await import('@lyra/app/reflexes/compose');
await runtime.db.query(
  `INSERT INTO outbox (id, studio_id, person_id, to_address, subject, body, state, claimed_at, created_at)
   VALUES ('ob_stranded', 'st_lumen', 'p_lena', 'lena.gruber@example.com', 'Stranded', 'Body', 'sending', now() - interval '1 hour', now() - interval '1 hour')`,
);
const swept = await server.request('/api/automation/vex', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${(await import('@niscorp/moss')).mintDevToken('p_auto_lumen')}` },
  body: JSON.stringify({
    fingerprint: 'automation/outbox-stuck',
    context: { stuckBefore: new Date(Date.now() - STUCK_AFTER_MS).toISOString() },
  }),
});
const found = (await swept.json().catch(() => ({}))) as { result?: { message_id: string }[] };
ok(
  'a message abandoned mid-send is found again',
  (found.result ?? []).some((r) => r.message_id === 'ob_stranded'),
  'the sweep asks the only question that can rescue it: what did this studio never send',
);
ok(
  '...and it hands the effect the same envelope the dispatcher does',
  Object.keys((found.result ?? [])[0] ?? {}).includes('to_address'),
  'one shape, two questions — a sweep with a narrower answer would mail an empty message',
);

report('a bounce is signed, scoped and acted on — and a message nobody came back for is found again');
