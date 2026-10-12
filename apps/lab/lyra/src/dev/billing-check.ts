import { OPERATOR_KEY } from './operator-key'; // first, before the world boots
import { createHmac } from 'node:crypto';
import { serve as listen } from '@hono/node-server';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, mintToken, ok, report, runtime, server, settle } from './world';
import { sweepLeaving } from '../../../lyra-integrations/src/integrations/stripe/leaving';
import { rememberAccount } from '../../../lyra-integrations/src/integrations/stripe/store';

const KEY = OPERATOR_KEY;
const PORT = 8793;
const LYRA_PORT = 8792;
const HOOK_SECRET = 'whsec_lab_billing_check';

process.env['STRIPE_SECRET'] = 'sk_test_billing_check_not_a_real_key';
process.env['STRIPE_WEBHOOK_SECRET'] = HOOK_SECRET;
delete process.env['DATABASE_URL'];

const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;

const lyraHttp = listen({ fetch: server.fetch, port: LYRA_PORT });
process.env['LYRA_BASE'] = `http://127.0.0.1:${LYRA_PORT}`;
const service = startIntegrations(PORT);

// Signed by hand in Stripe's scheme: Lyra depends on no payment SDK.
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
        // Stripe carries `current_period_end` on the subscription item; on API
        // version 2026-07-29.dahlia the subscription object does not carry it at all.
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

const readEnv = (name: string): string => process.env[name] ?? '';

const closeLyra = (): Promise<void> =>
  new Promise((resolve) => {
    (lyraHttp as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    lyraHttp.close(() => setTimeout(resolve, 25));
  });

try {
  const registered = await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  process.env['STRIPE_KEY'] = String(registered['key'] ?? '');
  await operator('/operator/integrations/stripe/approve', {});
  const owner = await login(CAST.northrock.owner);
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'stripe' } });
  await settle(18);
  ok('the payments integration holds a key for this deployment', String(process.env['STRIPE_KEY']).startsWith('ik_'), 'minted at registration, shown once');

  const before = await runtime.db.query<{ paid_until: unknown; status: string }>(
    "SELECT paid_until, status FROM subscriptions WHERE id = 'sub_omar'",
  );
  ok('...and the member is not paid up yet', before.rows[0]?.paid_until === null, 'nothing has told lyra anything about money');

  const unsigned = await server.request('/integrations/stripe/hook/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: subscriptionEvent('evt_unsigned', 'active', 0, {}),
  });
  ok('an unsigned delivery is refused', unsigned.status === 400, `${unsigned.status} — nobody vouched for this, so the integration asked the signature`);

  const wrongSecret = await deliver(subscriptionEvent('evt_wrong', 'active', 0, {}), 'whsec_a_different_secret');
  ok('...and one signed with the wrong secret', wrongSecret.status === 400, String(wrongSecret.status));

  const tampered = await server.request('/integrations/stripe/hook/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signPayload(subscriptionEvent('evt_x', 'active', 0, {}), HOOK_SECRET),
    },
    body: `${subscriptionEvent('evt_x', 'active', 0, {})} `,
  });
  ok('...and a body one byte different from what was signed', tampered.status === 400, 'the bytes reached the integration unparsed, or this would pass by accident');

  const paidUntil = Math.floor(Date.parse('2027-03-31T00:00:00Z') / 1000);
  const applied = await deliver(subscriptionEvent('evt_1', 'active', paidUntil, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  ok('a signed subscription event is accepted', applied.status === 200, JSON.stringify(applied.body).slice(0, 90));

  const after = await runtime.db.query<{ paid_until: unknown; status: string }>(
    "SELECT paid_until, status FROM subscriptions WHERE id = 'sub_omar'",
  );
  const day = (value: unknown): string => (value === null || value === undefined ? '' : new Date(String(value)).toISOString().slice(0, 10));
  ok('...and the membership is paid up in lyra', day(after.rows[0]?.paid_until) === '2027-03-31', `paid until ${day(after.rows[0]?.paid_until)} — Stripe said it, lyra holds it`);
  ok('...standing and all', after.rows[0]?.status === 'active', String(after.rows[0]?.status));

  const repeat = await deliver(subscriptionEvent('evt_1', 'active', paidUntil, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  ok('the same event again is a no-op', repeat.status === 200 && repeat.body['repeat'] === true, 'claimed once by an insert that either wins or loses');

  const later = Math.floor(Date.parse('2027-04-30T00:00:00Z') / 1000);
  await deliver(subscriptionEvent('evt_2', 'active', later, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  const reordered = await runtime.db.query<{ paid_until: unknown }>("SELECT paid_until FROM subscriptions WHERE id = 'sub_omar'");
  ok('a newer event moves it on', day(reordered.rows[0]?.paid_until) === '2027-04-30', day(reordered.rows[0]?.paid_until));

  const orphan = await deliver(subscriptionEvent('evt_orphan', 'canceled', paidUntil, {}));
  ok('an event naming no membership is skipped, not guessed', orphan.status === 200 && orphan.body['applied'] === false, String(orphan.body['detail'] ?? ''));

  const untouched = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_omar'");
  ok('...and nobody was cancelled by it', untouched.rows[0]?.status === 'active', 'the cancellation had nowhere to point, so it went nowhere');

  await deliver(subscriptionEvent('evt_gone', 'canceled', later, { subscription_id: 'sub_omar', person_id: 'p_omar', studio_id: 'st_northrock' }));
  const gone = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_omar'");
  ok('a cancelled subscription lands as cancelled', gone.rows[0]?.status === 'cancelled', String(gone.rows[0]?.status));

  await deliver(subscriptionEvent('evt_late', 'past_due', paidUntil, { subscription_id: 'sub_nina', person_id: 'p_nina', studio_id: 'st_northrock' }));
  const late = await runtime.db.query<{ status: string; paid_until: unknown }>(
    "SELECT status, paid_until FROM subscriptions WHERE id = 'sub_nina'",
  );
  ok('a failed payment does not end a membership', late.rows[0]?.status === 'active', `${String(late.rows[0]?.status)} — past due is a date, not a standing`);
  ok('...it moves the date instead', day(late.rows[0]?.paid_until) === '2027-03-31', 'a studio decides who leaves; a card decline does not');
  const followUpsFor = async (studioId: string): Promise<{ title: string; person_id: string | null; source: string }[]> => {
    const rows = await runtime.db.query<{ title: string; person_id: string | null; source: string }>(
      'SELECT title, person_id, source FROM notifications WHERE studio_id = $1 ORDER BY created_at DESC',
      [studioId],
    );
    return rows.rows;
  };
  const beforeDunning = (await followUpsFor('st_northrock')).length;

  await deliver(subscriptionEvent('evt_late_1', 'past_due', paidUntil, { subscription_id: 'sub_ruben', person_id: 'p_ruben', studio_id: 'st_northrock' }));
  const stillTraining = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_ruben'");
  ok('a first failure leaves them training', stillTraining.rows[0]?.status === 'active', 'Stripe is still retrying, and so is the membership');

  const afterFirst = await followUpsFor('st_northrock');
  ok('...but the desk is told', afterFirst.length === beforeDunning + 1, `${afterFirst.length - beforeDunning} follow-up`);
  ok('...naming who it is about', (afterFirst[0]?.title ?? '').includes('Ruben'), String(afterFirst[0]?.title));
  ok('...and attached to them, so the desk can open the record', afterFirst[0]?.person_id !== null, 'a follow-up nobody is attached to is research, not a task');

  const mailFor = async (personId: string): Promise<{ subject: string; marketing: boolean }[]> =>
    (await runtime.db.query<{ subject: string; marketing: boolean }>(
      'SELECT subject, marketing FROM outbox WHERE person_id = $1 ORDER BY created_at DESC',
      [personId],
    )).rows;
  const queued = await mailFor('p_ruben');
  ok('...and so is the member', queued.length === 1, `${queued.length} message queued`);
  ok('...in words they can act on', (queued[0]?.subject ?? '').includes('did not go through'), String(queued[0]?.subject));
  ok('...and not as marketing, which consent would have suppressed', queued[0]?.marketing === false, 'a failed payment is not news');

  await deliver(subscriptionEvent('evt_late_2', 'unpaid', paidUntil, { subscription_id: 'sub_ruben', person_id: 'p_ruben', studio_id: 'st_northrock' }));
  const finalState = await runtime.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_ruben'");
  ok('a final failure pauses the membership', finalState.rows[0]?.status === 'paused', `${String(finalState.rows[0]?.status)} — not cancelled, because nobody decided to leave`);

  const afterFinal = await followUpsFor('st_northrock');
  ok('...and says so on the desk’s list', afterFinal.length === beforeDunning + 2, `${afterFinal.length - beforeDunning} follow-ups — the escalation did not collapse into the retry notice`);
  ok('...as its own kind of task', afterFinal.some((f) => f.source === 'payment-failed') && afterFinal.some((f) => f.source === 'payment-retry'), afterFinal.map((f) => f.source).join(', '));

  await deliver(subscriptionEvent('evt_late_3', 'unpaid', paidUntil, { subscription_id: 'sub_ruben', person_id: 'p_ruben', studio_id: 'st_northrock' }));
  const afterRepeat = await followUpsFor('st_northrock');
  ok('...while the same failure twice is still one task', afterRepeat.length === beforeDunning + 2, `${afterRepeat.length - beforeDunning} — five delivery attempts do not make five jobs`);

  const notLeaving = await runtime.db.query<{ ends_on: unknown; notice_given_on: unknown }>(
    "SELECT ends_on, notice_given_on FROM subscriptions WHERE id = 'sub_ruben'",
  );
  ok('...without inventing a leaving date', notLeaving.rows[0]?.ends_on === null && notLeaving.rows[0]?.notice_given_on === null, 'a notice is a person’s decision, and no person made one here');

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
  ok('the money screen reads the integration’s own mirror', rows.length === 2, `${rows.length} invoices, newest first`);
  ok('...saying whose money it is', rows.every((r) => (r as { person_name?: string }).person_name === 'Omar Haddad'), rows.map((r) => (r as { person_name?: string }).person_name).join(', '));
  ok('...in the studio’s money, not in cents', rows[0]?.amount_display === '€89.00', String(rows[0]?.amount_display));
  ok('...saying what each one is', rows.map((r) => r.state_label).join(', ') === 'Unpaid, Paid', rows.map((r) => r.state_label).join(', '));

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

  const purchaseEvent = (
    eventId: string,
    sessionId: string,
    paymentStatus: string,
    meta: Record<string, string>,
    type = 'checkout.session.completed',
  ): string =>
    JSON.stringify({
      id: eventId,
      object: 'event',
      type,
      account: 'acct_probe',
      data: { object: { id: sessionId, object: 'checkout.session', payment_status: paymentStatus, metadata: meta } },
    });

  const countOf = async (sql: string): Promise<number> =>
    Number((await runtime.db.query<{ n: number }>(sql)).rows[0]?.n ?? -1);

  const passesFor = async (personId: string): Promise<number> =>
    Number(
      (await runtime.db.query<{ n: number }>('SELECT count(*) n FROM passes WHERE person_id = $1', [personId])).rows[0]?.n ?? -1,
    );

  const buying = { purchase_kind: 'pass', target_id: 'of_nr_dropin', person_id: 'p_nina', studio_id: 'st_northrock' };
  const heldBefore = await passesFor('p_nina');

  const unpaid = await deliver(purchaseEvent('evt_buy_pending', 'cs_slow', 'unpaid', buying));
  ok('a completed checkout that is not PAID grants nothing', unpaid.status === 200 && unpaid.body['waiting'] === true, JSON.stringify(unpaid.body));
  ok('...and the member holds no more than before', (await passesFor('p_nina')) === heldBefore, 'completed is not paid, and only paid buys anything');

  const bought = await deliver(purchaseEvent('evt_buy', 'cs_one', 'paid', buying));
  ok('a paid checkout hands over the pass', bought.status === 200 && bought.body['granted'] === true, JSON.stringify(bought.body));
  ok('...as a real entitlement on the member', (await passesFor('p_nina')) === heldBefore + 1, 'one drop-in, bought online, spendable at the door');

  const boughtRow = await runtime.db.query<{ paid_via: string; credits_total: number; purchase_ref: string }>(
    "SELECT paid_via, credits_total, purchase_ref FROM passes WHERE person_id = 'p_nina' ORDER BY created_at DESC LIMIT 1",
  );
  ok('...marked as paid by card, not by the desk', boughtRow.rows[0]?.paid_via === 'stripe', String(boughtRow.rows[0]?.paid_via));
  ok('...with the credits stamped from the offering', boughtRow.rows[0]?.credits_total === 1, `${String(boughtRow.rows[0]?.credits_total)} credit — a drop-in IS a one-credit pass`);

  const again = await deliver(purchaseEvent('evt_buy_again', 'cs_one', 'paid', buying));
  ok('the same purchase arriving again buys nothing more', (await passesFor('p_nina')) === heldBefore + 1, `${String(await passesFor('p_nina'))} passes — a second delivery is not a second sale`);
  ok('...and still reports success, because the member does hold it', again.body['granted'] === true, JSON.stringify(again.body).slice(0, 120));

  const settled = await deliver(purchaseEvent('evt_slow_ok', 'cs_slow', 'paid', buying, 'checkout.session.async_payment_succeeded'));
  ok('a payment that settles later still buys the pass', settled.body['granted'] === true, JSON.stringify(settled.body).slice(0, 100));
  ok('...and it is a second pass, because it was a second purchase', (await passesFor('p_nina')) === heldBefore + 2, 'one session, one pass — two sessions, two');

  ok(
    '...without troubling anybody about it',
    (await countOf("SELECT count(*) n FROM notifications WHERE studio_id = 'st_northrock' AND source = 'purchase-failed'")) === 0,
    'a second delivery of a finished purchase is not a task',
  );

  const feeBuying = {
    subscription_id: 'sub_nina',
    person_id: 'p_nina',
    studio_id: 'st_northrock',
    joining_fee_id: 'of_nr_joining',
  };
  const joined = await deliver(purchaseEvent('evt_joined', 'cs_joined', 'paid', feeBuying));
  ok('a joining fee is charged because somebody joined', joined.body['joiningFee'] === true, JSON.stringify(joined.body).slice(0, 110));
  ok(
    '...and lands as a purchase on the member',
    (await countOf("SELECT count(*) n FROM purchases WHERE person_id = 'p_nina' AND price_cents = 3000")) === 1,
    'its own row, so ending the membership does not un-buy it',
  );
  await deliver(purchaseEvent('evt_joined_again', 'cs_joined', 'paid', feeBuying));
  ok('...once, however many times the checkout is delivered', (await countOf("SELECT count(*) n FROM purchases WHERE person_id = 'p_nina'")) === 1, 'joining twice is not a thing that happened');

  const feePassesBefore = await passesFor('p_hana');

  const lying = { purchase_kind: 'pass', target_id: 'of_nr_joining', person_id: 'p_hana', studio_id: 'st_northrock' };
  const refusedFee = await deliver(purchaseEvent('evt_fee_wrong', 'cs_fee_wrong', 'paid', lying));
  ok('a one-off cannot be sold as a pass', refusedFee.body['granted'] === false, JSON.stringify(refusedFee.body).slice(0, 110));
  ok('...and nobody gains a class from paying to join', (await passesFor('p_hana')) === feePassesBefore, 'the database refused, not the caller');
  ok(
    '...but somebody IS told, because they were charged',
    (await countOf("SELECT count(*) n FROM notifications WHERE studio_id = 'st_northrock' AND source = 'purchase-failed'")) === 1,
    'a paid purchase that did not land is a task, not a log line',
  );

  const buyingFee = { purchase_kind: 'one_off', target_id: 'of_nr_joining', person_id: 'p_hana', studio_id: 'st_northrock' };
  const fee = await deliver(purchaseEvent('evt_fee', 'cs_fee', 'paid', buyingFee));
  ok('a one-off is bought like anything else', fee.body['granted'] === true, JSON.stringify(fee.body).slice(0, 100));
  ok('...and lands as a purchase', (await countOf("SELECT count(*) n FROM purchases WHERE person_id = 'p_hana'")) === 1, 'its own table, because it entitles nobody to anything');
  ok('...still without granting a class', (await passesFor('p_hana')) === feePassesBefore, 'a joining fee is not a session');

  const feeRow = await runtime.db.query<{ price_cents: number; paid_via: string }>(
    "SELECT price_cents, paid_via FROM purchases WHERE person_id = 'p_hana'",
  );
  ok('...with the price they actually paid', feeRow.rows[0]?.price_cents === 3000, `${String(feeRow.rows[0]?.price_cents)} cents, from the offering at the moment of sale`);
  ok('...and how they paid it', feeRow.rows[0]?.paid_via === 'stripe', String(feeRow.rows[0]?.paid_via));

  const leavingSub = 'sub_omar';
  await runtime.db.query("UPDATE subscriptions SET paid_via = 'stripe' WHERE id = $1", [leavingSub]);
  await rememberAccount(undefined, {
    studioId: 'st_northrock',
    accountId: 'acct_probe',
    studioName: 'North Rock BJJ',
    country: 'AT',
    createdAt: new Date().toISOString(),
  });

  const indexed = await server.request('/integrations/stripe/hook/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signPayload(subscriptionEvent('evt_index', 'active', paidUntil, { subscription_id: leavingSub, person_id: 'p_omar', studio_id: 'st_northrock' }), HOOK_SECRET) },
    body: subscriptionEvent('evt_index', 'active', paidUntil, { subscription_id: leavingSub, person_id: 'p_omar', studio_id: 'st_northrock' }),
  });
  ok('an ordinary event teaches which provider subscription is which membership', indexed.status === 200, 'the reverse index fills from traffic, not from a second fetch');

  const quiet = await sweepLeaving(readEnv, undefined);
  ok('a sweep with nobody leaving stops nothing', quiet.leaving === 0, JSON.stringify(quiet));

  await asPrincipal(CAST.northrock.owner, '/api/member/vex', {
    fingerprint: 'subscriptions/give-notice',
    context: { subscriptionId: leavingSub },
  });
  const ends = await runtime.db.query<{ ends_on: unknown }>('SELECT ends_on FROM subscriptions WHERE id = $1', [leavingSub]);
  ok('giving notice sets a leaving date', ends.rows[0]?.ends_on !== null, `${day(ends.rows[0]?.ends_on)} — the longer of notice and the minimum term`);

  const sweep = await sweepLeaving(readEnv, undefined);
  ok('...and the sweep finds them', sweep.leaving === 1, JSON.stringify(sweep));
  ok('...with the provider subscription resolved, not missing', sweep.missing === 0, `${sweep.missing} unresolved — a membership marked stripe that this service cannot name`);

  const secondGo = await server.request('/integrations/stripe/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(await mintToken('omar.haddad@example.com'))}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const secondBody = await secondGo.text();
  ok('a member already being billed cannot start a second subscription', secondGo.status === 409 && secondBody.includes('already set up'), `${secondGo.status} ${secondBody.slice(0, 90)}`);

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
