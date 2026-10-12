import type { Integration } from '../../integration';
import { STRIPE_BUNDLE } from './bundle';
import { accountFor, rememberAccount, storeIsDurable, stripeSubscriptionFor } from './store';
import { accountStanding, balanceFor, createConnectedAccount, createOnboardingLink, createPortalSession, notReadyToCharge, payoutsFor, refundInvoice, stripeFor } from './client';
import { createCheckout, createPurchase, customerFor } from './checkout';
import { billableFor, namesForSubscriptions, purchaseFor, subscriptionsOfPerson } from './lyra';
import { handleStripeEvent } from './hooks';
import { invoicesFor, invoicesForSubscriptions, ledgerRows, payoutRows } from './ledger';

const SYMBOLS: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
import { sweepLeaving } from './leaving';

export const stripeIntegration: Integration = {
  id: 'stripe',
  env: ['STRIPE_SECRET', 'STRIPE_WEBHOOK_SECRET', 'LYRA_BASE', 'STRIPE_KEY', 'STRIPE_SWEEP_MS'],
  bundle: () => STRIPE_BUNDLE,

  mount: (r, ctx) => {
    if (!storeIsDurable(ctx.db)) {
      console.warn('[stripe] no DATABASE_URL — connected accounts are held in memory and will not survive a restart. Run: pnpm --filter lyra-integrations db:up && pnpm --filter lyra-integrations migrate');
    }

    r.post('/account', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ account_id: '', state_label: 'Not connected', state_tone: 'neutral', detail: '' });

      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) {
        return c.json({ account_id: held.accountId, state_label: 'Unavailable', state_tone: 'warn', detail: 'This deployment holds no Stripe key.' });
      }
      try {
        const standing = await accountStanding(stripe, held.accountId);
        const label =
          standing.state === 'ready' ? 'Ready' : standing.state === 'in_review' ? 'In review' : 'Needs details';
        const tone = standing.state === 'ready' ? 'good' : standing.state === 'in_review' ? 'calm' : 'warn';
        return c.json({
          account_id: held.accountId,
          state: standing.state,
          ready: standing.ready,
          actionable: standing.state === 'needs_info',
          state_label: label,
          state_tone: tone,
          detail: standing.detail,
        });
      } catch (err) {
        return c.json({ account_id: held.accountId, state: 'in_review', ready: false, actionable: false, state_label: 'Unknown', state_tone: 'neutral', detail: `Stripe did not answer: ${String(err).slice(0, 120)}` });
      }
    });

    r.post('/onboarding-link', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not connected yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      const base = ctx.env('LYRA_BASE').replace(/\/$/, '');
      if (base === '') return c.json({ message: 'This deployment has no address to return to.' }, 503);

      try {
        const url = await createOnboardingLink(stripe, held.accountId, `${base}/`);
        return c.json({ url });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    r.post('/connect', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      if (held !== undefined) return c.json({ account_id: held.accountId, state_label: 'Needs details', state_tone: 'warn', detail: 'This studio is already connected.' });

      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);
      if (who.country === '') return c.json({ message: 'This studio has no country set, so no merchant account can be created for it.' }, 409);

      try {
        const accountId = await createConnectedAccount(stripe, {
          studioName: who.legalName !== '' ? who.legalName : who.studioName === '' ? who.studioId : who.studioName,
          country: who.country,
          entityType: who.legalForm === 'individual' ? 'individual' : 'company',
        });
        await rememberAccount(ctx.db, {
          studioId: who.studioId,
          accountId,
          studioName: who.studioName === '' ? who.studioId : who.studioName,
          country: who.country,
          createdAt: new Date().toISOString(),
        });
        const standing = await accountStanding(stripe, accountId);
        return c.json({ account_id: accountId, state_label: 'Needs details', state_tone: 'warn', detail: standing.detail });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    r.post('/checkout', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      if (who.personId === '') return c.json({ message: 'Only somebody the studio knows can pay for a membership.' }, 403);

      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      const notReady = await notReadyToCharge(stripe, held.accountId);
      if (notReady !== undefined) return c.json({ message: notReady }, 409);

      const billable = await billableFor(ctx.env, who.studioId, who.personId);
      if (billable === undefined) return c.json({ message: 'There is nothing to pay for on this membership.' }, 409);

      const already = await stripeSubscriptionFor(ctx.db, who.studioId, billable.subscriptionId);
      if (already !== undefined) {
        return c.json({ message: 'Your payment is already set up. Use Manage payment method to change the card it comes off.' }, 409);
      }

      const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
      // The return address is the host's, never the caller's: a caller-supplied
      // return on a payment flow is an open redirect.
      const base = ctx.env('LYRA_BASE').replace(/\/$/, '');
      const returnUrl = base === '' ? '' : `${base}/`;
      if (returnUrl === '') return c.json({ message: 'This deployment has no address to return to.' }, 503);

      const fee = billable.joiningFeeId === '' ? undefined : await purchaseFor(ctx.env, who.studioId, 'pass', billable.joiningFeeId);

      try {
        const session = await createCheckout(stripe, ctx.db, {
          accountId: held.accountId,
          subscriptionId: billable.subscriptionId,
          personId: who.personId,
          studioId: who.studioId,
          email: typeof body.email === 'string' ? body.email : '',
          planName: billable.planName,
          amount: billable.amount,
          currency: billable.currency,
          interval: billable.interval,
          intervalCount: billable.intervalCount,
          // A fee that no longer resolves (retired since the plan named it) is
          // not charged, rather than failing the whole checkout.
          ...(fee === undefined || fee.amount <= 0 ? {} : { joiningFee: { name: fee.name, amount: fee.amount } }),
          joiningFeeId: fee === undefined ? '' : billable.joiningFeeId,
          returnUrl,
        });
        return c.json({ url: session.url, plan_name: billable.planName });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    r.post('/portal', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      if (who.personId === '') return c.json({ message: 'Only somebody the studio knows has payments to manage.' }, 403);

      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      const customerId = await customerFor(ctx.db, who.studioId, who.personId);
      if (customerId === undefined) return c.json({ message: 'There is no payment set up for you yet.' }, 409);

      const base = ctx.env('LYRA_BASE').replace(/\/$/, '');
      if (base === '') return c.json({ message: 'This deployment has no address to return to.' }, 503);

      try {
        return c.json({ url: await createPortalSession(stripe, held.accountId, customerId, `${base}/`) });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    r.post('/purchase', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      if (who.personId === '') return c.json({ message: 'Only somebody the studio knows can buy this.' }, 403);

      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      const body = (await c.req.json().catch(() => ({}))) as { kind?: unknown; targetId?: unknown; email?: unknown };
      const kind = body.kind === 'course' ? 'course' : 'pass';
      const targetId = typeof body.targetId === 'string' ? body.targetId : '';

      const purchase = await purchaseFor(ctx.env, who.studioId, kind, targetId);
      // One sentence for retired, sold out and not this studio's: saying which
      // would answer questions about another studio's price list.
      if (purchase === undefined) return c.json({ message: 'That is not on sale just now.' }, 409);
      if (purchase.amount <= 0) return c.json({ message: 'There is nothing to pay for this.' }, 409);

      const base = ctx.env('LYRA_BASE').replace(/\/$/, '');
      if (base === '') return c.json({ message: 'This deployment has no address to return to.' }, 503);

      try {
        const session = await createPurchase(stripe, ctx.db, {
          accountId: held.accountId,
          personId: who.personId,
          studioId: who.studioId,
          email: typeof body.email === 'string' ? body.email : '',
          kind: purchase.kind,
          targetId: purchase.targetId,
          name: purchase.name,
          amount: purchase.amount,
          currency: purchase.currency,
          returnUrl: `${base}/`,
        });
        return c.json({ url: session.url, item_name: purchase.name });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    r.post('/ledger', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const invoices = await invoicesFor(ctx.db, who.studioId);
      const named = await namesForSubscriptions(ctx.env, who.studioId, invoices.map((i) => i.subscriptionId));
      return c.json(ledgerRows(invoices, named));
    });

    r.post('/payouts', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      const stripe = stripeFor(ctx.env);
      if (held === undefined || stripe === undefined) return c.json({ payouts: [], pending_display: '', available_display: '', detail: '' });
      try {
        const [balance, payouts] = await Promise.all([balanceFor(stripe, held.accountId), payoutsFor(stripe, held.accountId)]);
        const money = (rows: { amount: number; currency: string }[]): string =>
          rows.length === 0 ? '—' : rows.map((row) => `${SYMBOLS[row.currency.toLowerCase()] ?? `${row.currency.toUpperCase()} `}${(row.amount / 100).toFixed(2)}`).join(' · ');
        return c.json({
          payouts: payoutRows(payouts),
          pending_display: money(balance.pending),
          available_display: money(balance.available),
          detail: '',
        });
      } catch (err) {
        return c.json({ payouts: [], pending_display: '—', available_display: '—', detail: `Stripe did not answer: ${String(err).slice(0, 120)}` });
      }
    });

    r.post('/member-ledger', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { personId?: unknown };
      const personId = typeof body.personId === 'string' ? body.personId : '';
      const held = await subscriptionsOfPerson(ctx.env, who.studioId, personId);
      return c.json(ledgerRows(await invoicesForSubscriptions(ctx.db, who.studioId, held)));
    });

    r.post('/preview/member', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
      const out: Record<string, unknown> = {};
      for (const personId of ids.slice(0, 50)) {
        const held = await subscriptionsOfPerson(ctx.env, who.studioId, personId);
        const paid = (await invoicesForSubscriptions(ctx.db, who.studioId, held)).filter((i) => i.status === 'paid');
        out[personId] = { hint: paid.length === 0 ? '' : `${String(paid.length)} paid` };
      }
      return c.json(out);
    });

    // No role check here: the host's perimeter keeps a member off the money
    // screen. The invoice id is checked against this studio's own ledger.
    r.post('/refund', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      const body = (await c.req.json().catch(() => ({}))) as { invoiceId?: unknown };
      const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : '';
      const mine = (await invoicesFor(ctx.db, who.studioId)).find((i) => i.invoiceId === invoiceId);
      if (mine === undefined) return c.json({ message: 'No such invoice at this studio.' }, 404);
      if (mine.refundedCents > 0) return c.json({ message: 'That has already been refunded.' }, 409);

      try {
        const { refunded } = await refundInvoice(stripe, held.accountId, invoiceId);
        return c.json({ refunded, message: 'Refunded. It will show here once Stripe confirms.' });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });
  },

  // A timer, because lyra cannot call this service. Opt-in: an interval firing
  // while a check has the service booted would make the suite order-dependent.
  sweep: (ctx) => {
    const every = Number(ctx.env('STRIPE_SWEEP_MS'));
    if (!Number.isFinite(every) || every <= 0) return undefined;
    return { everyMs: every, run: async () => { await sweepLeaving(ctx.env, ctx.db); } };
  },

  // One route, not one per event type: Stripe names the type inside the signed
  // payload, and a type in the URL would be unsigned.
  hooks: (r, ctx) => {
    r.post('/events', async (c) => {
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      // The exact bytes: the signature is over what Stripe sent, and anything
      // that parses and re-emits the body breaks verification.
      const raw = Buffer.from(await c.req.arrayBuffer());
      const signature = c.req.header('stripe-signature') ?? '';
      const outcome = await handleStripeEvent(stripe, ctx.db, ctx.env, raw, signature);
      return c.json(outcome.body, outcome.status as 200);
    });
  },
};
