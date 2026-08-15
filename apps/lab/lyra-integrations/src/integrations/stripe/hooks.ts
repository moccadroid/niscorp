import type Stripe from 'stripe';
import type { IntegrationEnv, IntegrationStore } from '../../integration';
import { billableFor, callLyra, grantPurchase, notifyDesk } from './lyra';
import { recordDispute, recordInvoice, recordRefund } from './ledger';
import { rememberSubscription } from './store';

// ═══════════════════════════════════════════════════════════════
// WHAT STRIPE TELLS US, AND WHAT WE DO ABOUT IT.
//
// This is the one path in the service with no principal. Moss forwards a
// vendor's call with no session and mints no assertion — there is nobody to be —
// so the hook context carries no identity function at all, and authenticating
// the caller is this file's own job against a signature only Stripe can make.
//
// THE BYTES MATTER. A signature is over exact bytes, so nothing between Stripe
// and `constructEvent` may parse and re-emit the body: moss forwards it as an
// ArrayBuffer and this reads it as one. A JSON round-trip would re-order one key
// and break every verification, in production only, on the day it went live.
//
// ASSERTIONS, NEVER DELTAS. Everything replayed into lyra states a standing —
// "active, paid until the 14th" — so a redelivery, a late delivery, or two
// events arriving out of order all mean the same thing. There is no counter to
// double and no cursor to lose.
// ═══════════════════════════════════════════════════════════════

const MEMORY_EVENTS = new Set<string>();

/**
 * Claim an event, once.
 *
 * An INSERT that either wins or loses — not a read followed by a write, which
 * is the same question with a race in the middle: two deliveries arriving
 * together would both read "not seen" and both act.
 */
const claimEvent = async (db: IntegrationStore | undefined, event: { id: string; type: string; account?: string }): Promise<boolean> => {
  if (db === undefined) {
    if (MEMORY_EVENTS.has(event.id)) return false;
    MEMORY_EVENTS.add(event.id);
    return true;
  }
  const result = await db.query<{ event_id: string }>(
    `INSERT INTO ${db.table('events')} (event_id, event_type, account_id)
     VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.id, event.type, event.account ?? ''],
  );
  return result.rows.length > 0;
};

const settleEvent = async (db: IntegrationStore | undefined, id: string, outcome: string, detail: string): Promise<void> => {
  if (db === undefined) return;
  await db.query(`UPDATE ${db.table('events')} SET outcome = $2, detail = $3 WHERE event_id = $1`, [id, outcome, detail.slice(0, 400)]);
};

// ── STRIPE'S WORDS → LYRA'S ──────────────────────────────────
//
// Lyra holds three: active, paused, cancelled. Stripe holds seven, and the
// mapping is where a subtle wrong answer would live, so it is written out rather
// than inferred.
//
// `past_due` maps to ACTIVE on purpose. Somebody whose card failed on Tuesday
// has not stopped being a member — Stripe is still retrying, they are still
// training, and what has actually changed is that `paid_until` is in the past,
// which every screen that cares can compare for itself. Putting it in the status
// column would be storing a date comparison, which is the bug lyra spent its
// `trialling`/`lapsed` refactor removing.
//
// `unpaid` is different, and it is the line between "the bank said no once" and
// "this is not being paid". Stripe reaches it only after its whole retry
// schedule is exhausted — so it is the FINAL failure, and it pauses. Not
// cancels: cancelling is a decision about the relationship, and nobody decided
// anything here except a card issuer. A paused membership can be un-paused by
// somebody at a desk in one click; a cancelled one has a leaving date and a
// notice period behind it.
//
// Either way a human is told — dunning writes a follow-up onto the desk's list,
// because a studio finding out from an empty class is worse than any status.
const STANDING: Record<string, 'active' | 'paused' | 'cancelled'> = {
  active: 'active',
  trialing: 'active',
  past_due: 'active',
  unpaid: 'paused',
  incomplete: 'active',
  paused: 'paused',
  canceled: 'cancelled',
  incomplete_expired: 'cancelled',
};

// The statuses that mean somebody should be told, and what to tell them. Stripe
// retries on its own schedule and we do not replace that (docs/archive/
// automation-requirements.md:
// "where Stripe already does something well, we defer to it") — we listen for
// the outcome and put it where a person looks.
// THE SOURCE DIFFERS BECAUSE THE THINGS DIFFER, and lyra's follow-up table is
// unique on (studio, source, person, day). That constraint is right — it stops
// five delivery attempts in an afternoon becoming five identical tasks — but it
// collapses on `source`, so filing both of these under one name would let the
// retry notice swallow the escalation, silently, on the day it matters.
//
// A repeat of the SAME thing still collapses, which is what the rule is for.
const DUNNING: Record<string, { source: string; body: string }> = {
  past_due: {
    source: 'payment-retry',
    body: 'A payment failed. Stripe will try again on its own schedule — nothing to do yet, but worth knowing.',
  },
  unpaid: {
    source: 'payment-failed',
    body: 'Payment has failed for the last time and the membership is now paused. Someone should talk to them.',
  },
};

const asDay = (seconds: unknown): string | null => {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString().slice(0, 10) : null;
};

// Stamped at checkout: WHICH subscription (the assert key — a person may hold
// more than one), WHO it is about (for the follow-up a failure writes), and
// WHOSE studio. Ids only; this service never learns a name it did not ask for.
// A one-off carries three more: WHICH kind of thing, and WHICH one — stamped
// on the session rather than on a subscription, because a single payment has no
// subscription object to hang anything on.
type Meta = { subscription_id?: string; person_id?: string; studio_id?: string; purchase_kind?: string; target_id?: string };

/**
 * State a subscription's standing in lyra.
 *
 * The identifiers come from the METADATA Stripe carries on the subscription,
 * stamped at checkout — so an event arriving months later resolves without a
 * lookup that could be stale, and without this service keeping a second index
 * that could disagree.
 */
// HOW FAR THE MONEY REACHES, and it is NOT where it used to be.
//
// `current_period_end` moved off the subscription and onto its ITEMS. On API
// version 2026-07-29.dahlia the subscription object does not carry it at all —
// reading the old place returns undefined, `paid_until` is written as null, and
// nothing errors. A live event is what surfaced this; the hand-written fixtures
// in billing-check had the old shape and passed happily.
//
// Both are read, newest first: a deployment pinned to an older version still
// answers, and the pin here is not a promise that Stripe never moves anything.
const periodEnd = (subscription: {
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
}): number | undefined => subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;

const assertStanding = async (
  env: IntegrationEnv,
  subscription: {
    status?: string;
    metadata?: Meta;
    items?: { data?: { current_period_end?: number; price?: { unit_amount?: number | null } }[] };
    current_period_end?: number;
  },
): Promise<{ ok: boolean; detail: string }> => {
  const meta = subscription.metadata ?? {};
  const subscriptionId = meta.subscription_id ?? '';
  const studioId = meta.studio_id ?? '';
  if (subscriptionId === '' || studioId === '') {
    // A subscription created outside this integration — by hand in the dashboard, or by
    // an older version — has nothing to point at. Recorded and skipped rather
    // than guessed: writing a standing onto the wrong subscription is worse than
    // writing none.
    return { ok: false, detail: 'no subscription in the event metadata' };
  }
  const status = STANDING[String(subscription.status ?? '')] ?? 'active';
  const answer = await callLyra(env, {
    studioId,
    resource: 'member',
    fingerprint: 'subscriptions/assert',
    context: {
      subscriptionId,
      status,
      paidUntil: asDay(periodEnd(subscription)),
      priceCents: subscription.items?.data?.[0]?.price?.unit_amount ?? null,
    },
  });
  return { ok: answer.ok, detail: answer.ok ? `${status} until ${asDay(periodEnd(subscription)) ?? 'unknown'}` : answer.message };
};

// Stripe's invoice shape → the mirror's. The metadata rides on the subscription
// the invoice belongs to, which is where checkout stamped it.
const mirrorInvoice = async (db: IntegrationStore | undefined, accountId: string, invoice: Record<string, unknown>): Promise<void> => {
  const meta = (invoice['subscription_details'] as { metadata?: Meta } | undefined)?.metadata ?? (invoice['metadata'] as Meta | undefined) ?? {};
  await recordInvoice(db, {
    invoiceId: String(invoice['id'] ?? ''),
    accountId,
    studioId: meta.studio_id ?? '',
    subscriptionId: meta.subscription_id ?? '',
    status: String(invoice['status'] ?? 'open'),
    amountCents: Number(invoice['amount_due'] ?? invoice['amount_paid'] ?? 0),
    refundedCents: 0,
    currency: String(invoice['currency'] ?? 'eur'),
    disputed: false,
    invoicedOn: asDay(invoice['created']) ?? '',
  });
};

export type HookOutcome = { status: number; body: Record<string, unknown> };

/**
 * Verify, claim, dispatch.
 *
 * Order is the whole safety story: a body that does not verify is not an event
 * and nothing about it is recorded; an event already claimed is answered 200
 * without acting, because Stripe asking twice must not charge anybody twice.
 */
export const handleStripeEvent = async (
  stripe: Stripe,
  db: IntegrationStore | undefined,
  env: IntegrationEnv,
  raw: Buffer,
  signature: string,
): Promise<HookOutcome> => {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (secret === '') return { status: 503, body: { message: 'This deployment holds no webhook secret.' } };

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // 400, so Stripe marks the delivery failed and retries — a signature that
    // does not verify is either a caller we should ignore or a secret that has
    // rotated, and both want a human rather than a silent 200.
    return { status: 400, body: { message: `Signature did not verify: ${String(err).slice(0, 120)}` } };
  }

  const fresh = await claimEvent(db, { id: event.id, type: event.type, account: event.account });
  if (!fresh) return { status: 200, body: { ok: true, repeat: true, event: event.id } };

  const accountId = event.account ?? '';
  const object = event.data.object as unknown as Record<string, unknown>;

  try {
    switch (event.type) {
      // ── standing ────────────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const applied = await assertStanding(env, object as never);

        // WHICH PROVIDER SUBSCRIPTION THIS MEMBERSHIP IS, recorded as it goes
        // past. Every other direction was already answered — the metadata
        // carries lyra's ids here — but "this member is leaving on the 14th,
        // stop charging them" needs the reverse, and had no way to ask it.
        //
        // A cache, filled from events rather than fetched: every subscription at
        // the provider carries the metadata this is derived from, so it rebuilds
        // itself from ordinary traffic.
        const held = ((object as { metadata?: Meta }).metadata ?? {}) as Meta;
        await rememberSubscription(db, {
          studioId: held.studio_id ?? '',
          subscriptionId: held.subscription_id ?? '',
          accountId,
          stripeSubscriptionId: String(object['id'] ?? ''),
        });

        // ── DUNNING: THE OUTCOME, NOT THE RETRIES ──────────────
        //
        // Stripe's own retry schedule is not replaced — where it already does
        // something well we defer to it (docs/archive/automation-requirements.md).
        // What this
        // does is listen for where that schedule ENDED and put it in front of a
        // person, because a studio learning about a failed payment from an empty
        // class is the failure mode worth spending a row on.
        const dunning = DUNNING[String((object as { status?: unknown }).status ?? '')];
        const meta = ((object as { metadata?: Meta }).metadata ?? {}) as Meta;
        let told = false;
        if (dunning !== undefined && (meta.studio_id ?? '') !== '') {
          const billable = await billableFor(env, meta.studio_id ?? '', meta.person_id ?? '');
          const name = billable?.personName ?? 'A member';
          told = await notifyDesk(env, {
            studioId: meta.studio_id ?? '',
            // Attached to the person where we could resolve one, so the desk can
            // open the record from the follow-up rather than going to look.
            personId: billable?.personId === undefined || billable.personId === '' ? null : billable.personId,
            subject: `${name}: payment problem`,
            body: dunning.body,
            source: dunning.source,
          });
        }

        await settleEvent(db, event.id, applied.ok ? 'applied' : 'skipped', `${applied.detail}${told ? ' · desk told' : ''}`);
        return { status: 200, body: { ok: true, applied: applied.ok, detail: applied.detail, told } };
      }

      // Checkout completing is the moment a member first has a subscription. The
      // subscription events above carry everything needed, and Stripe sends them
      // too — so this only notes that it happened rather than asserting twice.
      // ── THE MOMENT A ONE-OFF IS ACTUALLY BOUGHT ─────────────
      //
      // For a SUBSCRIPTION this is still only a note: the subscription events
      // carry everything and Stripe sends them too, so asserting here would
      // assert twice.
      //
      // For a PASS or a COURSE SEAT it is the whole thing. There is no row in
      // lyra yet and deliberately so — an entitlement created when somebody
      // opened a card form would be a pass they could spend without paying, and
      // no later event would take it back. So this is the first and only place
      // the thing is granted, and it runs after money.
      // BOTH, because one purchase can arrive as two events. A delayed payment
      // method completes the session unpaid and settles later under
      // `async_payment_succeeded` — handled nowhere, until now, so a member
      // paying by anything slower than a card bought nothing and was charged.
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const purchase = (object['metadata'] as Meta | undefined) ?? {};
        const kind = purchase.purchase_kind ?? '';
        if (kind === '') {
          // A SUBSCRIPTION CHECKOUT. The subscription events carry the standing
          // and Stripe sends them too, so nothing is asserted here — but this is
          // the one moment that says WHO COLLECTS, and nothing else ever could.
          //
          // `paid_via` is chosen when the subscription starts, and a member
          // starting one themselves has no processor in the path yet, so it says
          // `manual`. `assert` never touches it, by design. Without this line a
          // member paying by card read "Billed by the studio" on their own
          // screen, and the desk chased them for money already taken.
          const started = (object['subscription_details'] as { metadata?: Meta } | undefined)?.metadata ?? purchase;
          const startedId = started.subscription_id ?? '';
          const startedStudio = started.studio_id ?? '';
          if (startedId !== '' && startedStudio !== '') {
            await callLyra(env, {
              studioId: startedStudio,
              resource: 'member',
              fingerprint: 'subscriptions/paid-by-provider',
              context: { subscriptionId: startedId },
            });
          }
          await settleEvent(db, event.id, 'noted', String(object['subscription'] ?? ''));
          return { status: 200, body: { ok: true, noted: 'checkout', collects: startedId !== '' } };
        }

        // PAID, not merely completed. A session can complete with payment still
        // in flight — a delayed method, a bank that answers tomorrow — and
        // granting on 'unpaid' hands over a pass for money that has not arrived.
        // Stripe sends the event again when it settles, and the claim above is
        // per EVENT, so the later delivery is a different event and lands here.
        if (String(object['payment_status'] ?? '') !== 'paid') {
          await settleEvent(db, event.id, 'skipped', `payment_status ${String(object['payment_status'] ?? 'unknown')}`);
          return { status: 200, body: { ok: true, waiting: true } };
        }

        const granted = await grantPurchase(env, {
          studioId: purchase.studio_id ?? '',
          personId: purchase.person_id ?? '',
          kind,
          targetId: purchase.target_id ?? '',
          // THE SESSION IS THE PURCHASE'S NAME, and the event is only the
          // envelope it came in. lyra is unique on (studio, purchase_ref) and
          // does nothing on conflict, so every later delivery about this same
          // session — a retry, or the settle-later event above — lands on the
          // pass the first one made.
          //
          // Naming the EVENT here instead is a second ten-pack, and it is not a
          // theoretical one: the two cases above are two event ids for one
          // purchase by construction.
          purchaseRef: String(object['id'] ?? ''),
        });
        await settleEvent(db, event.id, granted.ok ? 'applied' : 'failed', granted.ok ? `${kind} granted` : granted.message);
        // A REFUSAL FROM LYRA IS NOT A RETRY. The money is taken and the
        // entitlement did not land, which is a person's problem now rather than
        // a delivery's — so it goes where a person looks instead of bouncing
        // between two machines until Stripe gives up in three days.
        if (!granted.ok && (purchase.studio_id ?? '') !== '') {
          await notifyDesk(env, {
            studioId: purchase.studio_id ?? '',
            personId: (purchase.person_id ?? '') === '' ? null : (purchase.person_id ?? null),
            subject: 'A paid purchase did not land',
            body: `Somebody paid for ${kind === 'course' ? 'a course place' : 'a pass'} and it could not be added to their record. They have been charged. ${granted.message}`.slice(0, 400),
            source: 'purchase-failed',
          });
        }
        return { status: 200, body: { ok: true, granted: granted.ok, kind } };
      }

      // ── the ledger ──────────────────────────────────────────
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        await mirrorInvoice(db, accountId, object);
        await settleEvent(db, event.id, 'mirrored', String(object['status'] ?? ''));
        return { status: 200, body: { ok: true, mirrored: String(object['id'] ?? '') } };
      }

      // MONEY GIVEN BACK is not the invoice changing status — a refunded
      // invoice is still `paid`. It is its own fact, kept beside the amount.
      case 'charge.refunded': {
        const refundedInvoice = String(object['invoice'] ?? '');
        const amount = Number(object['amount_refunded'] ?? 0);
        if (refundedInvoice !== '') await recordRefund(db, refundedInvoice, amount);
        await settleEvent(db, event.id, 'mirrored', `refunded ${String(amount)}`);
        return { status: 200, body: { ok: true } };
      }

      // A dispute names a CHARGE, and the charge carries the invoice it
      // settled. Marked rather than deleted: a disputed invoice is the one
      // somebody has to do something about, and it must not vanish from the
      // list that would tell them.
      case 'charge.dispute.created': {
        const disputedInvoice = String(object['invoice'] ?? '');
        if (disputedInvoice !== '') await recordDispute(db, disputedInvoice);
        await settleEvent(db, event.id, 'mirrored', 'dispute opened');
        return { status: 200, body: { ok: true } };
      }

      // ── the studio's own account ────────────────────────────
      //
      // Onboarding progress. Nothing is written to lyra: whether Stripe has
      // finished verifying a business is not a fact about a membership, and the
      // setup screen asks Stripe directly when somebody opens it.
      case 'account.updated': {
        await settleEvent(db, event.id, 'noted', String(object['id'] ?? ''));
        return { status: 200, body: { ok: true, noted: 'account' } };
      }

      default: {
        // 200, deliberately. An event we do not handle is not a failure, and
        // answering anything else makes Stripe retry it forever.
        await settleEvent(db, event.id, 'ignored', event.type);
        return { status: 200, body: { ok: true, ignored: event.type } };
      }
    }
  } catch (err) {
    // The event is claimed but did not land. Recorded as failed and answered
    // 500 so Stripe redelivers — and the claim row already exists, so the retry
    // is what re-runs it rather than a second row.
    await settleEvent(db, event.id, 'failed', String(err));
    if (db !== undefined) await db.query(`DELETE FROM ${db.table('events')} WHERE event_id = $1 AND outcome = 'failed'`, [event.id]);
    return { status: 500, body: { message: String(err).slice(0, 200) } };
  }
};
