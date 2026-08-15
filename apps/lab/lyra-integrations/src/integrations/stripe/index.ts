import type { Integration } from '../../integration';
import { STRIPE_BUNDLE } from './bundle';
import { accountFor, rememberAccount, storeIsDurable, stripeSubscriptionFor } from './store';
import { accountStanding, createAccountSession, createConnectedAccount, createOnboardingLink, createPortalSession, notReadyToCharge, refundInvoice, stripeFor } from './client';
import { embedPage, notOnboardedPage, unavailablePage } from './onboarding';
import { createCheckout, createPurchase, customerFor } from './checkout';
import { billableFor, namesForSubscriptions, purchaseFor, subscriptionsOfPerson } from './lyra';
import { handleStripeEvent } from './hooks';
import { invoicesFor, invoicesForSubscriptions, ledgerRows } from './ledger';
import { sweepLeaving } from './leaving';

// ═══════════════════════════════════════════════════════════════
// STRIPE — payments, as an integration.
//
// Every route is relative and every one asks `ctx.identity(c)` with no audience
// argument: the mounting bound this integration's id to both, so a token minted for
// another integration on this deployment cannot be read here even by a handler that
// never thought about it.
//
// THE STUDIO IN THE ASSERTION IS THE ONLY STUDIO THIS TOUCHES. Nothing reads a
// studio id from a body; there is nowhere for one to come from but the token,
// which is what makes "connect THIS studio" unable to mean somebody else's.
// ═══════════════════════════════════════════════════════════════

export const stripeIntegration: Integration = {
  id: 'stripe',
  // Named, and therefore fenced: this integration cannot read another's secret even
  // knowing its name, and Belts cannot read STRIPE_SECRET (integration.ts).
  env: ['STRIPE_SECRET', 'STRIPE_PUBLISHABLE', 'STRIPE_WEBHOOK_SECRET', 'LYRA_BASE', 'STRIPE_KEY', 'STRIPE_SWEEP_MS'],
  bundle: () => STRIPE_BUNDLE,

  mount: (r, ctx) => {
    // SAID OUT LOUD, ONCE, AT BOOT. With no database this integration keeps connected
    // account ids in memory, and a restart loses the only mapping between a
    // studio and a live merchant account at Stripe. That is fine for a check
    // and unacceptable for a deployment, and the difference between those two
    // is not visible from a screen — so it is visible in the log instead.
    if (!storeIsDurable(ctx.db)) {
      console.warn('[stripe] no DATABASE_URL — connected accounts are held in memory and will not survive a restart. Run: pnpm --filter lyra-integrations db:up && pnpm --filter lyra-integrations migrate');
    }

    // What the setup and money screens both open on: does this studio have an
    // account, and what is Stripe still waiting for.
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
        // THREE STATES, not a boolean. The screen branches on `state` to decide
        // whether to offer a button at all — offering one when Stripe is
        // reviewing (`in_review`) is what sent the owner in circles.
        const label =
          standing.state === 'ready' ? 'Ready' : standing.state === 'in_review' ? 'In review' : 'Needs details';
        const tone = standing.state === 'ready' ? 'good' : standing.state === 'in_review' ? 'calm' : 'warn';
        return c.json({
          account_id: held.accountId,
          state: standing.state,
          ready: standing.ready,
          // Whether the STUDIO can do something now — the only thing that should
          // put an action button on the screen.
          actionable: standing.state === 'needs_info',
          state_label: label,
          state_tone: tone,
          detail: standing.detail,
        });
      } catch (err) {
        // A provider being down is an ordinary condition, not an outage here:
        // the screen says so and nothing is claimed about the studio.
        return c.json({ account_id: held.accountId, state: 'in_review', ready: false, actionable: false, state_label: 'Unknown', state_tone: 'neutral', detail: `Stripe did not answer: ${String(err).slice(0, 120)}` });
      }
    });

    // ── HOSTED ONBOARDING: the owner's way to enter their details ──
    //
    // A short-lived redirect to Stripe's own hosted onboarding form, returning
    // to lyra when done. This is the path that works TODAY — the embedded
    // component needs platform-side Connect config that is not in place, so it
    // renders blank; hosted onboarding needs none.
    //
    // The return address is the HOST's, and neither this integration nor its caller
    // chooses it — a caller-supplied return on a payment onboarding flow is an
    // open redirect that lands somebody on a page that looks like Stripe and is
    // not.
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

    // CONNECTING IS ONE CALL AND IT IS NOT REVERSIBLE ON STRIPE'S SIDE. The
    // dashboard type is fixed at creation — changing it means a NEW account
    // object — so this refuses to make a second one for a studio that has one
    // rather than quietly stranding the first.
    r.post('/connect', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      if (held !== undefined) return c.json({ account_id: held.accountId, state_label: 'Needs details', state_tone: 'warn', detail: 'This studio is already connected.' });

      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);
      // WHERE THE STUDIO TRADES DECIDES WHAT STRIPE ASKS IT FOR, and it arrives
      // in the assertion rather than being a constant here. No country, no
      // account — a guess would create a merchant in the wrong jurisdiction, and
      // the account object cannot be moved afterwards.
      if (who.country === '') return c.json({ message: 'This studio has no country set, so no merchant account can be created for it.' }, 409);

      try {
        // THE STUDIO'S NAME, not its id. This said `who.studioId`, so North Rock
        // became a merchant called `st_northrock` — the name Stripe then uses in
        // its own correspondence with the business.
        const accountId = await createConnectedAccount(stripe, {
          // THE REGISTERED NAME WHERE THERE IS ONE. A provider puts this on
          // documents and asks a register about it; the name above the door is
          // the fallback, and the studio id is the fallback's fallback.
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

    // ── THE MEMBER PAYS ────────────────────────────────────────
    //
    // The membership comes from the ASSERTION, never the body: a member cannot
    // ask to pay for somebody else's membership because there is nowhere to say
    // whose. What to charge comes from lyra over this integration's own key — the
    // price list is the studio's, and a payment provider does not get to have
    // an opinion about it.
    r.post('/checkout', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      if (who.personId === '') return c.json({ message: 'Only somebody the studio knows can pay for a membership.' }, 403);

      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      // READY TO CHARGE? Asked here, in a sentence, rather than discovered at a
      // card form. Automatic tax refuses a session when the merchant is not set
      // up for it, and that refusal arrives as a provider's error code in front
      // of a member who was trying to pay their gym.
      const notReady = await notReadyToCharge(stripe, held.accountId);
      if (notReady !== undefined) return c.json({ message: notReady }, 409);

      const billable = await billableFor(ctx.env, who.studioId, who.personId);
      if (billable === undefined) return c.json({ message: 'There is nothing to pay for on this membership.' }, 409);

      // ALREADY PAYING. A second checkout for a membership a provider is already
      // billing is a second subscription and a second charge every month — and
      // it is not a hypothetical mistake: this screen offers one button, the
      // redirect races the webhook, and somebody who came back unsure whether it
      // worked pressed it again.
      //
      // The reverse index is what makes this answerable: it names the provider
      // subscription behind a membership, which nothing could do before.
      const already = await stripeSubscriptionFor(ctx.db, who.studioId, billable.subscriptionId);
      if (already !== undefined) {
        return c.json({ message: 'Your payment is already set up. Use Manage payment method to change the card it comes off.' }, 409);
      }

      const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
      // The return address is the HOST's, and neither this integration nor its caller
      // gets to choose it — a caller-supplied return on a payment flow is an
      // open redirect, and it lands somebody on a page that looks like a receipt
      // and is not.
      const base = ctx.env('LYRA_BASE').replace(/\/$/, '');
      const returnUrl = base === '' ? '' : `${base}/`;
      if (returnUrl === '') return c.json({ message: 'This deployment has no address to return to.' }, 503);

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
          returnUrl,
        });
        return c.json({ url: session.url, plan_name: billable.planName });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    // ── THE MEMBER'S OWN CARD ──────────────────────────────────
    //
    // A door into the studio's billing portal for the person in the assertion,
    // and nobody else: the customer is looked up by (studio, person) from this
    // integration's own map, so there is nowhere for a caller to name whose
    // payment details they would like to manage.
    //
    // What the portal is ALLOWED to do is configured rather than accepted
    // (client.ts) — updating a card and reading invoices, never cancelling and
    // never switching plan, because those two are lyra's and have terms behind
    // them.
    r.post('/portal', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      if (who.personId === '') return c.json({ message: 'Only somebody the studio knows has payments to manage.' }, 403);

      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      // NO CUSTOMER, NOTHING TO MANAGE — and that is an ordinary state, not a
      // failure: somebody who has never paid through the app has no card on
      // file anywhere. The sentence says so rather than opening an empty portal.
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

    // ── BUYING ONE THING ───────────────────────────────────────
    //
    // A pass, a drop-in, a course place. The other half of what a studio sells,
    // and until now the half with no way to pay for it: a studio could author a
    // €18 drop-in and a €240 block and take money for neither except at a desk.
    //
    // WHICH thing comes from the body and that is fine — WHOSE studio and WHICH
    // person do not, so the worst a caller can name is something their own
    // studio sells to themselves. The PRICE is never in the body; it is read
    // from lyra, and a caller who could send an amount would be setting it.
    r.post('/purchase', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      if (who.personId === '') return c.json({ message: 'Only somebody the studio knows can buy this.' }, 403);

      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.json({ message: 'This studio is not taking payments yet.' }, 409);
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      const body = (await c.req.json().catch(() => ({}))) as { kind?: unknown; targetId?: unknown; email?: unknown };
      // What the caller says is only a HINT about which read to make; for
      // anything on the price list the kind comes back from lyra, so a caller
      // cannot decide whether their purchase grants classes.
      const kind = body.kind === 'course' ? 'course' : 'pass';
      const targetId = typeof body.targetId === 'string' ? body.targetId : '';

      const purchase = await purchaseFor(ctx.env, who.studioId, kind, targetId);
      // ONE SENTENCE FOR SEVERAL REFUSALS, deliberately: retired, sold out, not
      // this studio's, not a thing at all. A member does not need to be told
      // which of those it was, and telling them turns this into a way to ask
      // questions about another studio's price list.
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

    // ── THE LEDGER, FROM THIS INTEGRATION'S OWN MIRROR ─────────
    //
    // Read from what the webhooks recorded, not from Stripe. A screen that
    // called a vendor on every open would be slow, rate-limited and broken
    // whenever they were — and S4 puts the ledger on this side precisely so it
    // is answerable without them.
    //
    // Scoped by the ASSERTION. Two studios install this integration and each reads its
    // own; there is nowhere for a caller to say whose.
    r.post('/ledger', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const invoices = await invoicesFor(ctx.db, who.studioId);
      const named = await namesForSubscriptions(ctx.env, who.studioId, invoices.map((i) => i.subscriptionId));
      return c.json(ledgerRows(invoices, named));
    });

    // ── ONE PERSON'S OWN PAYMENTS ──────────────────────────────
    //
    // What the panel on a member's record reads. The person is named by the
    // host — a panel is opened ON somebody — and the studio is still the
    // assertion's, so naming somebody else's person id resolves to subscriptions
    // this studio does not have and therefore to no invoices.
    r.post('/member-ledger', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { personId?: unknown };
      const personId = typeof body.personId === 'string' ? body.personId : '';
      const held = await subscriptionsOfPerson(ctx.env, who.studioId, personId);
      return c.json(ledgerRows(await invoicesForSubscriptions(ctx.db, who.studioId, held)));
    });

    // THE STRIP, before the panel is opened. The host paints a line per offered
    // person while deriving the list, so this answers about several at once and
    // says only what a strip can show.
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

    // ── GIVING MONEY BACK ──────────────────────────────────────
    //
    // Reached only from the money screen, which is a desk action — so the
    // perimeter is what keeps a member off it, and this handler needs no opinion
    // about who is asking beyond the studio in the assertion.
    //
    // THE INVOICE MUST BE THIS STUDIO'S, checked against this integration's own
    // mirror rather than taken from the body. Without that, an id from another
    // studio's ledger would refund another studio's customer with this studio's
    // money.
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
        // NOT WRITTEN HERE. The `charge.refunded` webhook records it, the same
        // way it does when somebody refunds from Stripe's own dashboard — so
        // there is one writer whoever pressed the button, and the screen shows
        // the same thing either way.
        return c.json({ refunded, message: 'Refunded. It will show here once Stripe confirms.' });
      } catch (err) {
        return c.json({ message: `Stripe refused: ${String(err).slice(0, 200)}` }, 502);
      }
    });

    // ── THE FRAMED PAGE ────────────────────────────────────────
    //
    // Reached only through a grant lyra minted for a path this bundle declared
    // (moss: the frames seam). The assertion still arrives, so this is scoped
    // exactly like every other route here.
    r.get('/embed/onboarding', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.html(unavailablePage('Who are you?'), 401);
      const held = await accountFor(ctx.db, who.studioId);
      if (held === undefined) return c.html(notOnboardedPage());

      const stripe = stripeFor(ctx.env);
      const publishable = ctx.env('STRIPE_PUBLISHABLE');
      if (stripe === undefined || publishable === '') return c.html(unavailablePage('This deployment holds no Stripe key.'));

      try {
        const clientSecret = await createAccountSession(stripe, held.accountId);
        return c.html(
          embedPage({
            publishableKey: publishable,
            clientSecret,
            component: 'account-onboarding',
            // Relative to THIS document, which lyra serves at its own origin —
            // so the refresh rides the grant already spent rather than needing
            // one of its own.
            refreshPath: 'session',
          }),
        );
      } catch (err) {
        return c.html(unavailablePage(`Stripe did not answer: ${String(err).slice(0, 160)}`));
      }
    });

    // The embedded component asks for a fresh session when the one it holds is
    // about to expire. Same identity as everything else — a session is minted
    // for the studio in the token and no other.
    r.post('/embed/session', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const held = await accountFor(ctx.db, who.studioId);
      const stripe = stripeFor(ctx.env);
      if (held === undefined || stripe === undefined) return c.json({ message: 'Not connected.' }, 404);
      try {
        return c.json({ client_secret: await createAccountSession(stripe, held.accountId) });
      } catch (err) {
        return c.json({ message: String(err).slice(0, 200) }, 502);
      }
    });
  },

  // ── WHAT LYRA HAS ENDED, TOLD TO THE PROVIDER ──────────────
  //
  // A sweep rather than a reaction, because lyra cannot call this service: the
  // proxy is person-driven and inbound-only. So this asks, on a timer, who is
  // leaving — and states a date rather than firing an event, which is what makes
  // running it twice free.
  //
  // THE TIMER IS OPT-IN. A check boots this service in-process dozens of times;
  // a background interval firing during one would reach across a suite and make
  // it order-dependent. Set the period to run it; leave it unset and the sweep
  // is only ever what somebody calls.
  sweep: (ctx) => {
    const every = Number(ctx.env('STRIPE_SWEEP_MS'));
    if (!Number.isFinite(every) || every <= 0) return undefined;
    return { everyMs: every, run: async () => { await sweepLeaving(ctx.env, ctx.db); } };
  },

  // ── WHAT STRIPE TELLS US ─────────────────────────────────────
  //
  // Mounted at `/stripe/hook/*`, which moss reaches with NO principal and NO
  // assertion — the one door on that server that asks for nothing, because a
  // vendor calling in has no session and could not have one.
  //
  // So the context here has no `identity` to call. What replaces it is the
  // signature, and `handleStripeEvent` verifies before it does anything at all.
  //
  // ONE ROUTE, not one per event type. Stripe posts every event to one endpoint
  // and names the type inside the signed payload; a route per type would put the
  // type in the URL, where it is unsigned and therefore a claim rather than a
  // fact.
  hooks: (r, ctx) => {
    r.post('/events', async (c) => {
      const stripe = stripeFor(ctx.env);
      if (stripe === undefined) return c.json({ message: 'This deployment holds no Stripe key.' }, 503);

      // THE EXACT BYTES. Not `c.req.json()`, not `c.req.text()` re-encoded —
      // the signature is over what Stripe sent, and anything that parses and
      // re-emits it breaks verification in a way that only shows up in
      // production, on the day it goes live.
      const raw = Buffer.from(await c.req.arrayBuffer());
      const signature = c.req.header('stripe-signature') ?? '';
      const outcome = await handleStripeEvent(stripe, ctx.db, ctx.env, raw, signature);
      return c.json(outcome.body, outcome.status as 200);
    });
  },
};
