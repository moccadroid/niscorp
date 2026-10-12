import type Stripe from 'stripe';
import type { IntegrationEnv, IntegrationStore } from '../../integration';
import { billableFor, callLyra, grantPurchase, mailMember, notifyDesk } from './lyra';
import { recordDispute, recordInvoice, recordRefund } from './ledger';
import { rememberSubscription } from './store';

const MEMORY_EVENTS = new Set<string>();

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

// `past_due` is active on purpose: Stripe is still retrying, and `paid_until`
// is what is in the past. `unpaid` comes only after its whole retry schedule,
// and pauses: a cancelled membership has a leaving date and a notice period.
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

// Two sources: lyra's follow-up table is unique on (studio, source, person,
// day), so under one the retry notice would swallow the escalation.
const DUNNING: Record<string, { source: string; body: string; subject: string; member: string }> = {
  past_due: {
    source: 'payment-retry',
    body: 'A payment failed. Stripe will try again on its own schedule — nothing to do yet, but worth knowing.',
    subject: 'Your payment did not go through',
    member:
      'Your membership payment did not go through. We will try again automatically over the next few days, so there is nothing you must do right now — but if your card has expired or changed, you can update it from Payment in the app and the next attempt will use it.',
  },
  unpaid: {
    source: 'payment-failed',
    body: 'Payment has failed for the last time and the membership is now paused. Someone should talk to them.',
    subject: 'Your membership is on hold',
    member:
      'We could not take payment for your membership after several attempts, so it is on hold for now. Updating your card under Payment in the app is usually all it takes — or talk to us at the studio and we will sort it out.',
  },
};

const asDay = (seconds: unknown): string | null => {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString().slice(0, 10) : null;
};

type Meta = { subscription_id?: string; person_id?: string; studio_id?: string; purchase_kind?: string; target_id?: string; joining_fee_id?: string };

// `current_period_end` is on the subscription's items on newer API versions
// and on the subscription itself on older ones.
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
    hostedUrl: String(invoice['hosted_invoice_url'] ?? ''),
    pdfUrl: String(invoice['invoice_pdf'] ?? ''),
  });
};

export type HookOutcome = { status: number; body: Record<string, unknown> };

// Verify, then claim, then dispatch: Stripe delivers an event more than once,
// and one already claimed is answered 200 without acting.
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
    // 400, so Stripe marks the delivery failed: a rotated secret must not pass.
    return { status: 400, body: { message: `Signature did not verify: ${String(err).slice(0, 120)}` } };
  }

  const fresh = await claimEvent(db, { id: event.id, type: event.type, account: event.account });
  if (!fresh) return { status: 200, body: { ok: true, repeat: true, event: event.id } };

  const accountId = event.account ?? '';
  const object = event.data.object as unknown as Record<string, unknown>;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const applied = await assertStanding(env, object as never);

        const held = ((object as { metadata?: Meta }).metadata ?? {}) as Meta;
        await rememberSubscription(db, {
          studioId: held.studio_id ?? '',
          subscriptionId: held.subscription_id ?? '',
          accountId,
          stripeSubscriptionId: String(object['id'] ?? ''),
        });

        const dunning = DUNNING[String((object as { status?: unknown }).status ?? '')];
        const meta = ((object as { metadata?: Meta }).metadata ?? {}) as Meta;
        let told = false;
        if (dunning !== undefined && (meta.studio_id ?? '') !== '') {
          const billable = await billableFor(env, meta.studio_id ?? '', meta.person_id ?? '');
          const name = billable?.personName ?? 'A member';
          await mailMember(env, {
            studioId: meta.studio_id ?? '',
            personId: billable?.personId ?? meta.person_id ?? '',
            subject: dunning.subject,
            body: dunning.member,
            source: dunning.source,
          });
          told = await notifyDesk(env, {
            studioId: meta.studio_id ?? '',
            personId: billable?.personId === undefined || billable.personId === '' ? null : billable.personId,
            subject: `${name}: payment problem`,
            body: dunning.body,
            source: dunning.source,
          });
        }

        await settleEvent(db, event.id, applied.ok ? 'applied' : 'skipped', `${applied.detail}${told ? ' · desk told' : ''}`);
        return { status: 200, body: { ok: true, applied: applied.ok, detail: applied.detail, told } };
      }

      // A pass or a course seat is granted here and nowhere earlier: a row made
      // when the card form opened could be spent without paying. A delayed
      // payment method settles later under `async_payment_succeeded`.
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const purchase = (object['metadata'] as Meta | undefined) ?? {};
        const kind = purchase.purchase_kind ?? '';
        if (kind === '') {
          // A subscription checkout, and the one event that says who collects:
          // `paid_via` starts as `manual` and `assert` never touches it.
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
          let joined = false;
          if ((started.joining_fee_id ?? '') !== '' && startedStudio !== '') {
            const granted = await grantPurchase(env, {
              studioId: startedStudio,
              personId: started.person_id ?? '',
              kind: 'one_off',
              targetId: started.joining_fee_id ?? '',
              purchaseRef: String(object['id'] ?? ''),
            });
            joined = granted.ok;
          }
          await settleEvent(db, event.id, 'noted', String(object['subscription'] ?? ''));
          return { status: 200, body: { ok: true, noted: 'checkout', collects: startedId !== '', joiningFee: joined } };
        }

        // A session can complete with the payment still in flight. The delivery
        // that settles it is a different event, so the claim does not block it.
        if (String(object['payment_status'] ?? '') !== 'paid') {
          await settleEvent(db, event.id, 'skipped', `payment_status ${String(object['payment_status'] ?? 'unknown')}`);
          return { status: 200, body: { ok: true, waiting: true } };
        }

        const granted = await grantPurchase(env, {
          studioId: purchase.studio_id ?? '',
          personId: purchase.person_id ?? '',
          kind,
          targetId: purchase.target_id ?? '',
          // The session id, not the event id: lyra is unique on (studio,
          // purchase_ref) and does nothing on conflict, and the two cases above
          // are two event ids for one purchase.
          purchaseRef: String(object['id'] ?? ''),
        });
        await settleEvent(db, event.id, granted.ok ? 'applied' : 'failed', granted.ok ? `${kind} granted` : granted.message);
        // A refusal from lyra is answered 200, not retried: the money is taken,
        // so it goes to the desk instead of bouncing until Stripe gives up.
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

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        await mirrorInvoice(db, accountId, object);
        await settleEvent(db, event.id, 'mirrored', String(object['status'] ?? ''));
        return { status: 200, body: { ok: true, mirrored: String(object['id'] ?? '') } };
      }

      case 'charge.refunded': {
        const refundedInvoice = String(object['invoice'] ?? '');
        const amount = Number(object['amount_refunded'] ?? 0);
        if (refundedInvoice !== '') await recordRefund(db, refundedInvoice, amount);
        await settleEvent(db, event.id, 'mirrored', `refunded ${String(amount)}`);
        return { status: 200, body: { ok: true } };
      }

      case 'charge.dispute.created': {
        const disputedInvoice = String(object['invoice'] ?? '');
        if (disputedInvoice !== '') await recordDispute(db, disputedInvoice);
        await settleEvent(db, event.id, 'mirrored', 'dispute opened');
        return { status: 200, body: { ok: true } };
      }

      case 'account.updated': {
        await settleEvent(db, event.id, 'noted', String(object['id'] ?? ''));
        return { status: 200, body: { ok: true, noted: 'account' } };
      }

      default: {
        await settleEvent(db, event.id, 'ignored', event.type);
        return { status: 200, body: { ok: true, ignored: event.type } };
      }
    }
  } catch (err) {
    // The event is claimed but did not land: answered 500 so Stripe redelivers,
    // and the redelivery runs it again.
    await settleEvent(db, event.id, 'failed', String(err));
    if (db !== undefined) await db.query(`DELETE FROM ${db.table('events')} WHERE event_id = $1 AND outcome = 'failed'`, [event.id]);
    return { status: 500, body: { message: String(err).slice(0, 200) } };
  }
};
