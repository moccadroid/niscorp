// THE LOOP CLOSING: Stripe says something, and a membership's standing moves.
//
// This is the assertion the whole payments build exists to make, and it runs
// with no network and no vendor. What makes that honest rather than a mock is
// that the SIGNATURE IS REAL: the event is signed with a known secret and
// verified by Stripe's own `constructEvent`, so the bytes, the header format and
// the verification are all the production path. Only the sender is us.
//
// The route is real too — the event goes in through moss's webhook door, the
// one surface that asks for nothing, and comes out at the pack having been
// forwarded unparsed. And the write back into lyra is the pack's own `ik_` key
// on its own charter rung, which is the same fence Phase 6 proved.
//
// Run: pnpm --filter lyra exec tsx src/dev/billing-check.ts
import { createHmac } from 'node:crypto';
import { serve as listen } from '@hono/node-server';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { login, mintToken, ok, report, runtime, server, settle } from './world';

const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;
const PORT = 8793;
const LYRA_PORT = 8792;
const HOOK_SECRET = 'whsec_lab_billing_check';

// A key the SDK can be constructed with. `constructEvent` is local crypto — it
// verifies an HMAC and parses JSON — so nothing here reaches Stripe.
process.env['STRIPE_SECRET'] = 'sk_test_billing_check_not_a_real_key';
process.env['STRIPE_WEBHOOK_SECRET'] = HOOK_SECRET;
delete process.env['DATABASE_URL'];

const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;

// Lyra on a real port: the pack writes back over HTTP with its own key, and an
// in-process hono has no address to be called at.
const lyraHttp = listen({ fetch: server.fetch, port: LYRA_PORT });
process.env['LYRA_BASE'] = `http://127.0.0.1:${LYRA_PORT}`;
const service = startIntegrations(PORT);

// SIGNED BY HAND, and deliberately so. Lyra depends on no payment SDK —
// frame-check asserts it, because a host that carried one would carry that
// dependency into every app that ever installs this pack. So this check writes
// the wire contract itself, exactly as the integrations service writes the
// assertion format rather than importing moss's signer.
//
// Stripe's scheme: HMAC-SHA256 over "<timestamp>.<payload>", presented as
// "t=<timestamp>,v1=<hex>". The VERIFICATION on the other side is Stripe's own
// constructEvent — only the sender is us.
const signPayload = (payload: string, secret: string): string => {
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
};

const operator = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-key': KEY },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
};

// A subscription event as Stripe sends one, carrying the metadata this pack
// stamps at checkout — which is how an event arriving months later resolves to a
// membership without a lookup that could be stale.
const subscriptionEvent = (id: string, status: string, periodEnd: number, meta: Record<string, string>): string =>
  JSON.stringify({
    id,
    object: 'event',
    type: 'customer.subscription.updated',
    account: 'acct_probe',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'sub_stripe_side',
        object: 'subscription',
        status,
        metadata: meta,
        // ON THE ITEM, NOT THE SUBSCRIPTION — and this is not a detail.
        //
        // `current_period_end` moved onto subscription items; on API version
        // 2026-07-29.dahlia the subscription object does not carry it at all.
        // This fixture had it at the top level, which is where the code read it,
        // so the check passed while a real event would have written `paid_until`
        // as null and never said anything. A live delivery through `stripe
        // trigger` is what found it.
        //
        // A fixture is only worth what it resembles, so this one is the shape
        // Stripe actually sends.
        items: { data: [{ current_period_end: periodEnd, price: { unit_amount: 8900 } }] },
      },
    },
  });

const deliver = async (payload: string, secret = HOOK_SECRET): Promise<{ status: number; body: Record<string, unknown> }> => {
  const signature = signPayload(payload, secret);
  const response = await server.request('/integrations/stripe/hook/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

const closeLyra = (): Promise<void> =>
  new Promise((resolve) => {
    (lyraHttp as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    lyraHttp.close(() => setTimeout(resolve, 25));
  });

try {
  // ── the pack is installed and holds a key of its own ─────────
  const registered = await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  process.env['STRIPE_KEY'] = String(registered['key'] ?? '');
  await operator('/operator/integrations/stripe/approve', {});
  const owner = await login(CAST.northrock.owner);
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'stripe' } });
  await settle(18);
  ok('the payments pack holds a key for this deployment', String(process.env['STRIPE_KEY']).startsWith('ik_'), 'minted at registration, shown once');

  const before = await runtime.db.query<{ paid_until: unknown; status: string }>(
    "SELECT paid_until, status FROM subscriptions WHERE id = 'sub_omar'",
  );
  ok('...and the member is not paid up yet', before.rows[0]?.paid_until === null, 'nothing has told lyra anything about money');

  // ── an unsigned call is not an event ─────────────────────────
  const unsigned = await server.request('/integrations/stripe/hook/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: subscriptionEvent('evt_unsigned', 'active', 0, {}),
  });
  ok('an unsigned delivery is refused', unsigned.status === 400, `${unsigned.status} — nobody vouched for this, so the pack asked the signature`);

  const wrongSecret = await deliver(subscriptionEvent('evt_wrong', 'active', 0, {}), 'whsec_a_different_secret');
  ok('...and one signed with the wrong secret', wrongSecret.status === 400, String(wrongSecret.status));

  const tampered = await server.request('/integrations/stripe/hook/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signPayload(subscriptionEvent('evt_x', 'active', 0, {}), HOOK_SECRET),
    },
    // Same signature, one byte more. The signature is over the BYTES, so this is
    // also the assertion that nothing between Stripe and the pack re-serialised
    // them — a JSON round-trip anywhere on this path fails exactly here.
    body: `${subscriptionEvent('evt_x', 'active', 0, {})} `,
  });
  ok('...and a body one byte different from what was signed', tampered.status === 400, 'the bytes reached the pack unparsed, or this would pass by accident');

  // ── THE LOOP ─────────────────────────────────────────────────
  const paidUntil = Math.floor(Date.parse('2027-03-31T00:00:00Z') / 1000);
  const applied = await deliver(subscriptionEvent('evt_1', 'active', paidUntil, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  ok('a signed subscription event is accepted', applied.status === 200, JSON.stringify(applied.body).slice(0, 90));

  const after = await runtime.db.query<{ paid_until: unknown; status: string }>(
    "SELECT paid_until, status FROM subscriptions WHERE id = 'sub_omar'",
  );
  const day = (value: unknown): string => (value === null || value === undefined ? '' : new Date(String(value)).toISOString().slice(0, 10));
  ok('...and the membership is paid up in lyra', day(after.rows[0]?.paid_until) === '2027-03-31', `paid until ${day(after.rows[0]?.paid_until)} — Stripe said it, lyra holds it`);
  ok('...standing and all', after.rows[0]?.status === 'active', String(after.rows[0]?.status));

  // ── STRIPE REDELIVERS, AND THAT MUST BE FREE ─────────────────
  const repeat = await deliver(subscriptionEvent('evt_1', 'active', paidUntil, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  ok('the same event again is a no-op', repeat.status === 200 && repeat.body['repeat'] === true, 'claimed once by an insert that either wins or loses');

  // A LATE delivery, arriving after a newer one. Assertions rather than deltas
  // is what makes this safe: it states a standing, so applying it out of order
  // states the same thing rather than adding a month twice.
  const later = Math.floor(Date.parse('2027-04-30T00:00:00Z') / 1000);
  await deliver(subscriptionEvent('evt_2', 'active', later, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  const reordered = await runtime.db.query<{ paid_until: unknown }>("SELECT paid_until FROM subscriptions WHERE id = 'sub_omar'");
  ok('a newer event moves it on', day(reordered.rows[0]?.paid_until) === '2027-04-30', day(reordered.rows[0]?.paid_until));

  // ── AN EVENT IT CANNOT PLACE IS NOT GUESSED ──────────────────
  //
  // A subscription made by hand in the dashboard has no membership in its
  // metadata. Writing a standing onto the wrong membership is worse than
  // writing none, so it is recorded and skipped.
  const orphan = await deliver(subscriptionEvent('evt_orphan', 'canceled', paidUntil, {}));
  ok('an event naming no membership is skipped, not guessed', orphan.status === 200 && orphan.body['applied'] === false, String(orphan.body['detail'] ?? ''));

  const untouched = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_omar'");
  ok('...and nobody was cancelled by it', untouched.rows[0]?.status === 'active', 'the cancellation had nowhere to point, so it went nowhere');

  // ── cancelling, when it DOES name somebody ───────────────────
  await deliver(subscriptionEvent('evt_gone', 'canceled', later, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  const gone = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_omar'");
  ok('a cancelled subscription lands as cancelled', gone.rows[0]?.status === 'cancelled', String(gone.rows[0]?.status));

  // ── AND A FAILED PAYMENT DOES NOT END A MEMBERSHIP ───────────
  //
  // `past_due` maps to ACTIVE. Somebody whose card failed on Tuesday has not
  // stopped being a member — they have stopped being paid up, which is
  // `paid_until` in the past and something every screen can compare for itself.
  // Storing it as a status would be storing a date comparison, which is the bug
  // lyra's `trialling`/`lapsed` refactor removed.
  await deliver(subscriptionEvent('evt_late', 'past_due', paidUntil, { subscription_id: 'sub_nina', person_id: 'p_nina', studio_id: 'st_northrock' }));
  const late = await runtime.db.query<{ status: string; paid_until: unknown }>(
    "SELECT status, paid_until FROM subscriptions WHERE id = 'sub_nina'",
  );
  ok('a failed payment does not end a membership', late.rows[0]?.status === 'active', `${String(late.rows[0]?.status)} — past due is a date, not a standing`);
  ok('...it moves the date instead', day(late.rows[0]?.paid_until) === '2027-03-31', 'a studio decides who leaves; a card decline does not');
  // ── DUNNING: THE OUTCOME REACHES A PERSON ────────────────────
  //
  // Stripe's own retry schedule is not replaced — where it already does
  // something well we defer to it. What matters is that the END of that schedule
  // lands somewhere a human looks, because a studio finding out about a failed
  // payment from an empty class is the failure worth spending a row on.
  const followUpsFor = async (studioId: string): Promise<{ title: string; person_id: string | null; source: string }[]> => {
    const rows = await runtime.db.query<{ title: string; person_id: string | null; source: string }>(
      'SELECT title, person_id, source FROM notifications WHERE studio_id = $1 ORDER BY created_at DESC',
      [studioId],
    );
    return rows.rows;
  };
  const beforeDunning = (await followUpsFor('st_northrock')).length;

  // FIRST FAILURE: Stripe is still trying, so the member is still active.
  await deliver(subscriptionEvent('evt_late_1', 'past_due', paidUntil, { subscription_id: 'sub_ruben', person_id: 'p_ruben', studio_id: 'st_northrock' }));
  const stillTraining = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_ruben'");
  ok('a first failure leaves them training', stillTraining.rows[0]?.status === 'active', 'Stripe is still retrying, and so is the membership');

  const afterFirst = await followUpsFor('st_northrock');
  ok('...but the desk is told', afterFirst.length === beforeDunning + 1, `${afterFirst.length - beforeDunning} follow-up`);
  ok('...naming who it is about', (afterFirst[0]?.title ?? '').includes('Ruben'), String(afterFirst[0]?.title));
  ok('...and attached to them, so the desk can open the record', afterFirst[0]?.person_id !== null, 'a follow-up nobody is attached to is research, not a task');

  // FINAL FAILURE: Stripe has exhausted its retries. Paused, not cancelled —
  // nobody decided to end anything except a card issuer.
  await deliver(subscriptionEvent('evt_late_2', 'unpaid', paidUntil, { subscription_id: 'sub_ruben', person_id: 'p_ruben', studio_id: 'st_northrock' }));
  const finalState = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_ruben'");
  ok('a final failure pauses the membership', finalState.rows[0]?.status === 'paused', `${String(finalState.rows[0]?.status)} — not cancelled, because nobody decided to leave`);

  // THE ESCALATION IS NOT SWALLOWED BY THE RETRY NOTICE.
  //
  // `notifications` is unique on (studio, source, person, day) — the right rule,
  // and it collapsed these two into one until they were given different sources.
  // "We will try again" and "we have given up and paused them" are different
  // tasks, and the second is the one somebody has to act on.
  const afterFinal = await followUpsFor('st_northrock');
  ok('...and says so on the desk’s list', afterFinal.length === beforeDunning + 2, `${afterFinal.length - beforeDunning} follow-ups — the escalation did not collapse into the retry notice`);
  ok('...as its own kind of task', afterFinal.some((f) => f.source === 'payment-failed') && afterFinal.some((f) => f.source === 'payment-retry'), afterFinal.map((f) => f.source).join(', '));

  // And the rule it relies on still does its job: the same failure arriving
  // again today is one task, not five.
  await deliver(subscriptionEvent('evt_late_3', 'unpaid', paidUntil, { subscription_id: 'sub_ruben', person_id: 'p_ruben', studio_id: 'st_northrock' }));
  const afterRepeat = await followUpsFor('st_northrock');
  ok('...while the same failure twice is still one task', afterRepeat.length === beforeDunning + 2, `${afterRepeat.length - beforeDunning} — five delivery attempts do not make five jobs`);

  // Paused is reversible in one click by somebody at a desk; cancelled carries a
  // leaving date and a notice period. The difference is the whole reason a card
  // decline does not reach for the second one.
  const notLeaving = await runtime.db.query<{ ends_on: unknown; notice_given_on: unknown }>(
    "SELECT ends_on, notice_given_on FROM subscriptions WHERE id = 'sub_ruben'",
  );
  ok('...without inventing a leaving date', notLeaving.rows[0]?.ends_on === null && notLeaving.rows[0]?.notice_given_on === null, 'a notice is a person’s decision, and no person made one here');

  // ── THE LEDGER IS THIS PACK'S OWN (S4) ───────────────────────
  //
  // Lyra holds standing and never learns an invoice; this side holds the
  // invoices and never learns a member's name. So the money screen reads the
  // pack's mirror rather than calling a vendor on every open — and the mirror is
  // filled by the same signed events as everything else.
  const invoice = (id: string, status: string, amount: number, created: number): string =>
    JSON.stringify({
      id: `evt_inv_${id}`,
      object: 'event',
      type: 'invoice.paid',
      account: 'acct_probe',
      data: {
        object: {
          id,
          object: 'invoice',
          status,
          amount_due: amount,
          currency: 'eur',
          created,
          subscription_details: { metadata: { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' } },
        },
      },
    });

  const march = Math.floor(Date.parse('2027-03-01T00:00:00Z') / 1000);
  await deliver(invoice('in_first', 'paid', 8900, march));
  await deliver(invoice('in_second', 'open', 8900, march + 86_400 * 30));

  const ledger = await server.request('/integrations/stripe/ledger', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(await mintToken(CAST.northrock.owner))}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const rows = (await ledger.json()) as { invoice_id: string; amount_display: string; state_label: string; note: string }[];
  ok('the money screen reads the pack’s own mirror', rows.length === 2, `${rows.length} invoices, newest first`);
  ok('...in the studio’s money, not in cents', rows[0]?.amount_display === '€89.00', String(rows[0]?.amount_display));
  ok('...saying what each one is', rows.map((r) => r.state_label).join(', ') === 'Unpaid, Paid', rows.map((r) => r.state_label).join(', '));

  // A REFUND IS NOT A STATUS CHANGE. A refunded invoice is still `paid` at
  // Stripe — the money going back is its own fact, and an integration that
  // overwrote the status would lose the amount.
  await deliver(
    JSON.stringify({
      id: 'evt_refund',
      object: 'event',
      type: 'charge.refunded',
      account: 'acct_probe',
      data: { object: { id: 'ch_1', object: 'charge', invoice: 'in_first', amount_refunded: 2000 } },
    }),
  );
  const refunded = (await (
    await server.request('/integrations/stripe/ledger', {
      method: 'POST',
      headers: { Authorization: `Bearer ${String(await mintToken(CAST.northrock.owner))}`, 'content-type': 'application/json' },
      body: '{}',
    })
  ).json()) as { invoice_id: string; state_label: string; note: string }[];
  const first = refunded.find((r) => r.invoice_id === 'in_first');
  ok('a refund shows as a refund', first?.state_label === 'Refunded', String(first?.state_label));
  ok('...with the amount that went back', first?.note === '€20.00 refunded', String(first?.note));

  // ── AND A STUDIO READS ITS OWN ───────────────────────────────
  const otherStudio = await server.request('/integrations/stripe/ledger', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(await mintToken(CAST.lumen.owner))}`, 'content-type': 'application/json' },
    body: '{}',
  });
  ok('...and nobody else’s', otherStudio.status === 404 || ((await otherStudio.json()) as unknown[]).length === 0, 'scoped by the assertion, like every other route here');
} finally {
  await service.close();
  await closeLyra();
}

report('Stripe speaks and a membership answers: signed, claimed once, and stated rather than counted.');
