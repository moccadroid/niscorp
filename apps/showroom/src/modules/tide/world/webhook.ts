import { createMemoryStore, createTide, zonedToUtc, type EffectRegistry, type ReflexInput, type Tide } from '@niscorp/tide';
import { drain, MINUTE, readLedger, recordOf, str, transform, TZ, type Snapshot } from './ledger';

// ═══════════════════════════════════════════════════════════
// The same webhook, twice — Grace's membership, fed by a payment provider.
//
// SIMULATED, and labelled on the page: the payment provider (a "Stripe" that
// sends events the way Stripe does: at least once, in no promised order), the
// mailer, and the NAIVE handler — the usual `app.post('/webhooks/stripe')`
// that does what each event says the moment it arrives.
// REAL: the tide side. The host parses each webhook into a signal fact with
// the provider's event id as its `dedupeKey`; four reflexes do the rest.
// ═══════════════════════════════════════════════════════════

export const OPENS = zonedToUtc({ year: 2026, month: 3, day: 2 }, 10, 0, TZ);
export const PRICE = 8900;

export type EventType = 'invoice.payment_succeeded' | 'invoice.payment_failed';
// What the provider sends. `created` is when the thing HAPPENED at the
// provider; the webhook can arrive much later, and more than once.
export type StripeEvent = { id: string; type: EventType; customer: string; invoice: string; created: number };
export type Delivery = { at: number; event: StripeEvent; retry: boolean; late: boolean };

export type Membership = { status: 'none' | 'active' | 'past_due'; payments: readonly { invoice: string; event: string }[]; lastEventAt: number };
export type Mail = { at: number; kind: 'receipt' | 'card-failed'; invoice: string };
export type SideState = { membership: Membership; mails: readonly Mail[] };

const EMPTY_MEMBERSHIP: Membership = { status: 'none', payments: [], lastEventAt: 0 };

// ── the naive handler, simulated ────────────────────────────────
// Do what the event says, now. No memory of what it has seen, no idea when
// the event happened.

export const naive = (deliveries: readonly Delivery[]): SideState => {
  let m: Membership = EMPTY_MEMBERSHIP;
  const mails: Mail[] = [];
  for (const d of deliveries) {
    const e = d.event;
    if (e.type === 'invoice.payment_succeeded') {
      m = { status: 'active', payments: [...m.payments, { invoice: e.invoice, event: e.id }], lastEventAt: e.created };
      mails.push({ at: d.at, kind: 'receipt', invoice: e.invoice });
    } else {
      m = { ...m, status: 'past_due', lastEventAt: e.created };
      mails.push({ at: d.at, kind: 'card-failed', invoice: e.invoice });
    }
  }
  return { membership: m, mails };
};

// ── tide, for real ──────────────────────────────────────────────

const isType = (t: string) => ({ $eq: [{ $ref: '$.fact.payload.type' }, t] });

export const REFLEXES: readonly ReflexInput[] = [
  {
    id: 'stripe.record-payment',
    intent: 'Record every successful payment the provider reports.',
    on: { fact: { signal: 'stripe' } },
    when: isType('invoice.payment_succeeded'),
    effect: { name: 'payments.record', input: { member: { $ref: '$.fact.payload.customer' }, invoice: { $ref: '$.fact.payload.invoice' }, event: { $ref: '$.fact.payload.id' } } },
  },
  {
    id: 'stripe.membership-status',
    intent: 'Set the membership’s status from the newest event the provider has sent.',
    on: { fact: { signal: 'stripe' } },
    // The guard is a question about reality: "is this event newer than what
    // the membership already reflects?" An old event arriving late selects no
    // row, and nothing happens — recorded as a run that selected 0.
    select: { query: { table: 'memberships', member: { $ref: '$.fact.payload.customer' }, olderThan: { $ref: '$.fact.payload.created' } }, mode: 'each', unitKey: 'member' },
    effect: {
      name: 'membership.set',
      input: {
        member: { $ref: '$.row.member' },
        status: { $case: { branches: [{ when: isType('invoice.payment_succeeded'), then: 'active' }], else: 'past_due' } },
        created: { $ref: '$.fact.payload.created' },
        invoice: { $ref: '$.fact.payload.invoice' },
      },
    },
  },
  {
    id: 'billing.receipt',
    intent: 'Email a receipt when a payment is recorded.',
    on: { fact: { entity: 'payments', op: 'insert' } },
    effect: { name: 'mail.send', input: { kind: 'receipt', invoice: { $ref: '$.row.invoice' } } },
  },
  {
    id: 'billing.card-failed',
    intent: 'Ask the member to update their card when their membership goes past due.',
    on: { fact: { entity: 'memberships', op: 'update' } },
    when: { $eq: [{ $ref: '$.fact.row.status' }, 'past_due'] },
    effect: { name: 'mail.send', input: { kind: 'card-failed', invoice: { $ref: '$.row.invoice' } } },
  },
];

export type Intake = { at: number; event: StripeEvent; accepted: boolean };
export type TideSide = SideState & { intake: readonly Intake[]; ledger: Snapshot };

export type Webhooks = { deliver: (d: Delivery) => Promise<TideSide>; state: (now: number) => Promise<TideSide> };

export const createWebhooks = async (): Promise<Webhooks> => {
  let membership: Membership = EMPTY_MEMBERSHIP;
  const mails: Mail[] = [];
  const intake: Intake[] = [];

  const effects: EffectRegistry = {
    'payments.record': {
      writes: ['payments'],
      run: (input, ctx) => {
        const rec = recordOf(input);
        const invoice = str(rec['invoice']);
        membership = { ...membership, payments: [...membership.payments, { invoice, event: str(rec['event']) }] };
        ctx.emit({ kind: 'write', entity: 'payments', op: 'insert', row: { member: str(rec['member']), invoice, amount: PRICE }, at: ctx.now });
        return { recorded: invoice };
      },
    },
    'membership.set': {
      writes: ['memberships'],
      run: (input, ctx) => {
        const rec = recordOf(input);
        const status = rec['status'] === 'active' ? 'active' : 'past_due';
        membership = { ...membership, status, lastEventAt: Number(rec['created'] ?? 0) };
        ctx.emit({ kind: 'write', entity: 'memberships', op: 'update', row: { member: str(rec['member']), status, invoice: str(rec['invoice']) }, at: ctx.now });
        return { status };
      },
    },
    'mail.send': {
      run: (input, ctx) => {
        const rec = recordOf(input);
        mails.push({ at: ctx.now, kind: rec['kind'] === 'card-failed' ? 'card-failed' : 'receipt', invoice: str(rec['invoice']) });
        return { sent: true };
      },
    },
  };

  const tide: Tide = createTide({
    store: createMemoryStore(),
    transform,
    select: (query) => {
      const q = recordOf(query);
      const olderThan = Number(q['olderThan'] ?? 0);
      return membership.lastEventAt < olderThan ? [{ member: str(q['member']), status: membership.status }] : [];
    },
    effects,
  });
  await tide.load(REFLEXES, { at: OPENS });

  const state = async (now: number): Promise<TideSide> => {
    await drain(tide, now);
    return { membership, mails: [...mails], intake: [...intake], ledger: await readLedger(tide, now) };
  };

  return {
    state,
    // The webhook endpoint, tide's way: parse, ingest with the event id as
    // the dedupe key, answer 200. A repeat is refused at the door.
    deliver: async (d) => {
      const fact = await tide.ingest({ kind: 'signal', name: 'stripe', payload: d.event, dedupeKey: d.event.id, at: d.at });
      intake.push({ at: d.at, event: d.event, accepted: fact !== undefined });
      return state(d.at);
    },
  };
};

// ── what the provider sends, per button ─────────────────────────

let serial = 0;
const nextId = (): string => {
  serial += 1;
  return `evt_1Q${(4000 + serial).toString(36).toUpperCase()}x${serial}`;
};

// A new invoice paid: one fresh event.
export const paid = (invoice: string, at: number): Delivery => ({
  at,
  retry: false,
  late: false,
  event: { id: nextId(), type: 'invoice.payment_succeeded', customer: 'grace', invoice, created: at },
});

// The provider didn't hear a 200 in time, so it sends the SAME event again.
export const resend = (d: Delivery, at: number): Delivery => ({ ...d, at, retry: true, late: false });

// Grace's card failed at first, she fixed it, the retry charge succeeded —
// and the provider delivers the success before the older failure.
export const outOfOrder = (invoice: string, at: number): readonly Delivery[] => {
  const failed: StripeEvent = { id: nextId(), type: 'invoice.payment_failed', customer: 'grace', invoice, created: at - 4 * MINUTE };
  const succeeded: StripeEvent = { id: nextId(), type: 'invoice.payment_succeeded', customer: 'grace', invoice, created: at };
  return [
    { at, retry: false, late: false, event: succeeded },
    { at: at + MINUTE, retry: false, late: true, event: failed },
  ];
};
