import type { CacheEntry, MutationEntry } from './index';
import { dateText, money, pattern } from '@lyra/app/prisms/format.prism';

const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

// ═══════════════════════════════════════════════════════════════
// WHAT SOMEBODY IS COMMITTED TO, and how they get out of it — and, since the
// remodel, HOW THEY GOT IN. Access and payment are different facts with
// different writers: `subscriptions/start` is the desk (or, later, the member
// themselves) granting access with `paid_via` chosen; `subscriptions/assert`
// is a payment provider stating what the money did; `record-payment` is the
// desk stating the same thing about money it took itself. A studio with no
// payment processor at all runs entirely on the first and third.
// ═══════════════════════════════════════════════════════════════

const SUBSCRIPTION_FIELDS = [
  { field: 'subscriptions.id', as: 'subscription_id' },
  'subscriptions.started_on',
  'subscriptions.committed_until',
  'subscriptions.notice_given_on',
  'subscriptions.ends_on',
  'subscriptions.monthly_cents',
  'subscriptions.currency',
  'subscriptions.paid_via',
  'subscriptions.paid_until',
  'subscriptions.status',
  { field: 'offerings.name', as: 'plan_name' },
  'offerings.minimum_term_months',
  'offerings.notice_days',
];

const SUBSCRIPTION_VALUE = {
  subscription_id: one('subscription_id'),
  plan_name: one('plan_name'),
  status: one('status'),
  value_display: money(one('monthly_cents'), one('currency')),
  started_display: dateText(one('started_on', null)),
  // The terms in the words a person would use, not the columns. "No
  // minimum" is a real answer and a selling point; blank is neither.
  term_display: {
    $case: {
      branches: [{ when: one('minimum_term_months'), then: pattern('{n} months', { n: one('minimum_term_months') }) }],
      else: 'No minimum',
    },
  },
  notice_display: {
    $case: {
      branches: [{ when: one('notice_days'), then: pattern('{n} days', { n: one('notice_days') }) }],
      else: 'None',
    },
  },
  // Only when there IS a commitment. With no minimum term the trigger stamps
  // committed_until = started_on — harmless to the arithmetic (a past date
  // loses every GREATEST), meaningless on a screen: "committed until" a date
  // already behind them, beside a field saying there is no commitment. The
  // column keeps its value; the display declines to say it.
  committed_display: {
    $case: {
      branches: [{ when: one('minimum_term_months'), then: dateText(one('committed_until', null)) }],
      else: '',
    },
  },
  ends_display: dateText(one('ends_on', null)),
  // How the money moves, in words a desk uses out loud.
  paid_via: one('paid_via'),
  paid_via_display: {
    $case: {
      branches: [
        { when: { $eq: [one('paid_via'), 'stripe'] }, then: 'Card, online' },
        { when: { $eq: [one('paid_via'), 'comp'] }, then: 'Complimentary' },
        { when: { $eq: [one('paid_via'), 'free'] }, then: 'Free' },
      ],
      else: 'Billed by the studio',
    },
  },
  paid_until: one('paid_until', null),
  paid_until_display: dateText(one('paid_until', null)),
  // What the screen branches on: notice is given once, and the control
  // that gives it disappears afterwards rather than being pressable twice.
  // Derived from the date, which is itself derived from the notice ledger
  // — one fact, one place it is decided.
  notice_given: { $case: { branches: [{ when: one('notice_given_on', null), then: true }], else: false } },
};

export const subscriptionForMember: CacheEntry = {
  fingerprint: 'subscriptions/for-member',
  intent: 'What this person is on, what they committed to, and when they leave',
  shape: {
    subscription_id: '',
    plan_name: '',
    status: '',
    value_display: '',
    started_display: '',
    term_display: '',
    notice_display: '',
    committed_display: '',
    ends_display: '',
    paid_via: '',
    paid_via_display: '',
    paid_until: '',
    paid_until_display: '',
    notice_given: false,
  },
  dsl: {
    from: ['subscriptions', 'offerings'],
    fields: SUBSCRIPTION_FIELDS,
    // A cancelled subscription has nothing left to give notice on. Paused does
    // — somebody on hold is still under contract, which is most of the reason a
    // studio sells terms.
    filter: {
      and: [
        { eq: ['subscriptions.person_id', { $context: 'personId' }] },
        { neq: ['subscriptions.status', 'cancelled'] },
      ],
    },
    limit: 1,
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: SUBSCRIPTION_VALUE } },
};

// The member's own copy of the same facts: no context key at all — the
// personal reach pins the rows to whoever is asking, and "whose subscription"
// is not a question the grammar lets them phrase.
export const myMembership: CacheEntry = {
  fingerprint: 'me/membership',
  intent: 'The subscription of whoever is asking',
  reach: 'personal',
  shape: {
    subscription_id: '',
    plan_name: '',
    status: '',
    value_display: '',
    started_display: '',
    term_display: '',
    notice_display: '',
    committed_display: '',
    ends_display: '',
    paid_via: '',
    paid_via_display: '',
    paid_until: '',
    paid_until_display: '',
    notice_given: false,
  },
  dsl: {
    from: ['subscriptions', 'offerings'],
    fields: SUBSCRIPTION_FIELDS,
    filter: { neq: ['subscriptions.status', 'cancelled'] },
    limit: 1,
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: SUBSCRIPTION_VALUE } },
};

// ── WHAT TO CHARGE, IN NUMBERS ───────────────────────────────
//
// The reads above are for screens: they say "€89" and "6 months" because a
// person is reading them. A billing integration needs the other thing — the
// amount as an integer, the interval as a word Stripe knows, the currency as
// a code — and asking it to parse "€89.00" back into 8900 would be inventing
// a second source of truth out of a display string.
//
// COALESCE is the grandfathering rule, stated once here rather than in the
// pack: a subscription's own `price_cents` is an override and the offering's
// is the fallback, so somebody on a rate the offering no longer sells keeps it.
//
// `subscription_id` is the contract's key now: checkout stamps it into the
// provider's metadata, the webhook hands it back to `assert`, and a person
// holding two subscriptions can never have the wrong one asserted. The two
// halves change together or not at all — billing-check proves the loop.
export const subscriptionBillable: CacheEntry = {
  fingerprint: 'subscriptions/billable',
  intent: 'What a person should be charged, as numbers a payment provider can use',
  shape: { subscription_id: '', offering_id: '', plan_name: '', amount: 0, currency: '', interval: '', status: '', paid_via: '', person_id: '', person_name: '' },
  dsl: {
    // The person joins because a billing integration has to be able to say WHO
    // — a follow-up reading "a payment failed" with nobody attached is a note
    // somebody has to go and research before they can act on it.
    from: ['subscriptions', 'offerings', 'people'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      'subscriptions.status',
      'subscriptions.currency',
      'subscriptions.paid_via',
      { field: 'offerings.id', as: 'offering_id' },
      { field: 'offerings.name', as: 'plan_name' },
      'offerings.interval',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    compute: {
      amount: { coalesce: ['subscriptions.price_cents', 'offerings.price_cents'] },
    },
    filter: {
      and: [
        { eq: ['subscriptions.person_id', { $context: 'personId' }] },
        { neq: ['subscriptions.status', 'cancelled'] },
      ],
    },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        subscription_id: one('subscription_id'),
        offering_id: one('offering_id'),
        plan_name: one('plan_name'),
        amount: one('amount', 0),
        currency: one('currency'),
        interval: one('interval'),
        status: one('status'),
        paid_via: one('paid_via'),
        person_id: one('person_id'),
        person_name: one('person_name'),
      },
    },
  },
};

// ── STARTING ONE ─────────────────────────────────────────────
//
// THE WRITE THE OLD MODEL DID NOT HAVE, which is why Tom Vogel "just had a
// membership" with no plan and no money attached: there was desk-side no way
// to put somebody on a plan at all. Access granted here; how the money moves
// is `paid_via`, chosen by whoever is responsible — `manual` needs no payment
// processor anywhere, and is how most studios run.
//
// The terms (currency, monthly value, committed_until) are stamped by the
// trigger from the offering, and `started_on` by the studio's own clock.
// The date is not sent: a browser does not get to say when a contract began.
export const subscriptionStart: MutationEntry = {
  fingerprint: 'subscriptions/start',
  intent: 'Put a person on a recurring offering, saying how it will be paid',
  mutation: {
    op: 'insert',
    table: 'subscriptions',
    values: {
      person_id: { $context: 'personId' },
      offering_id: { $context: 'offeringId' },
      paid_via: { $context: 'paidVia' },
    },
  },
};

// ── RECORDING MONEY THE STUDIO TOOK ITSELF ───────────────────
//
// The desk's `assert`: cash in the drawer, a bank transfer spotted, the SEPA
// run cleared — "their money reaches the 14th" is the same fact whoever
// writes it, and this is the desk's pen. Standing only (Decision D3): a cash
// ledger mirroring stripe_invoices is a follow-on, not a prerequisite.
// It sets how far the money reaches and NOTHING else — never terms, never a
// notice, never the plan. Exactly the discipline `assert` is held to.
export const subscriptionRecordPayment: MutationEntry = {
  fingerprint: 'subscriptions/record-payment',
  intent: 'Record how far a subscription is paid, as the studio itself knows it',
  mutation: {
    op: 'update',
    table: 'subscriptions',
    set: { paid_until: { $context: 'paidUntil' } },
    where: { eq: ['subscriptions.id', { $context: 'subscriptionId' }] },
  },
};

// Ending directly — the desk's "they are gone", distinct from notice run its
// course. The trigger stamps the day from the studio's clock. Coming back is
// NOT un-cancelling: a return is a new `subscriptions/start`, because the
// terms they come back on are today's, not the ones they left.
export const subscriptionEnd: MutationEntry = {
  fingerprint: 'subscriptions/end',
  intent: 'End a subscription as of today',
  mutation: {
    op: 'update',
    table: 'subscriptions',
    set: { status: 'cancelled' },
    where: { eq: ['subscriptions.id', { $context: 'subscriptionId' }] },
  },
};

// ── GIVING NOTICE ────────────────────────────────────────────
//
// The leaving DATE is not written here and could not be: it is
// GREATEST(committed_until, notice_given_on + notice_days), which is arithmetic
// over a joined row, and a closed mutation grammar cannot say that. The trigger
// does it (schema.ts), which is also why four screens ending a subscription
// cannot disagree about when somebody actually leaves.
//
// NOTICE IS AN INSERT INTO ITS OWN TABLE, and that is the whole security story.
//
// While it was a column on `subscriptions`, "may give notice" and "may state a
// billing standing" were the same grant — a charter grant is table.verb and
// cannot tell two updates on one table apart. So the payments rung, which needs
// `subscriptions.write.update` to assert, could have ended somebody's
// membership by giving notice for them. The table split is what splits the
// grant, and the engine draws the fence instead of everyone remembering.
//
// THE DATE IS NOT SENT. `given_on` is stamped by the trigger from
// `studio_today()`, because a person gives notice and does not choose the day it
// counts from — backdating past a commitment is exactly the number a minimum
// term exists to protect. `studio_id` is stamped engine-side, as everywhere.
export const subscriptionGiveNotice: MutationEntry = {
  fingerprint: 'subscriptions/give-notice',
  intent: 'Record that a member has given notice, dated by the studio’s own clock',
  mutation: {
    op: 'insert',
    table: 'subscription_notices',
    values: { subscription_id: { $context: 'subscriptionId' } },
  },
};

// ── THE INTEGRATION'S ENTIRE WRITE SURFACE ───────────────────
//
// ASSERTIONS, NEVER DELTAS. A payment provider redelivers, retries and reorders
// — so "they are active and paid until the 14th" can be applied twice, late, or
// out of order and mean the same thing, where "add a month" cannot. Re-applying
// this is a no-op by construction, which is why there is no event log to
// reconcile and no cursor to lose.
//
// WHAT IT MAY NOT TOUCH is the point of it being one narrow entry:
// `notice_given_on`, `committed_until`, the offering and its terms, and
// `paid_via` are all absent. Those are what a person decided and what this
// app's trigger derived — a billing system finding out somebody stopped paying
// is not the same fact as somebody giving notice, and if it could write both,
// the second would eventually be inferred from the first.
//
// KEYED ON THE SUBSCRIPTION, because a person may hold more than one and the
// provider must not guess. Checkout stamped the id into the provider's
// metadata; the webhook hands it back. `studio_id` is stamped and matched
// engine-side (behaviors.ts) — so the integration cannot name another studio's
// row even holding a valid key, and does not send a studio id at all.
//
// WHY THIS RUNG MAY MOVE SOMEBODY'S STANDING WHEN THE AUTOMATION RUNG MAY NOT:
// the automation rung holds no standing write because nothing unattended
// should alter a row a human wrote. This does not alter what a human wrote —
// it records what a member's own payment did, which no human here authored.
export const subscriptionAssert: MutationEntry = {
  fingerprint: 'subscriptions/assert',
  intent: 'State a subscription’s standing as billing currently understands it',
  mutation: {
    op: 'update',
    table: 'subscriptions',
    set: {
      status: { $context: 'status' },
      paid_until: { $context: 'paidUntil' },
      // The amount actually charged, which is the reason the override column
      // exists: a member can be on a price their offering never had.
      price_cents: { $context: 'priceCents' },
    },
    where: { eq: ['subscriptions.id', { $context: 'subscriptionId' }] },
  },
};

// ── PAUSING, AS A LEDGER ─────────────────────────────────────
//
// Its own table for the charter's reason (see schema.ts): "may freeze their
// own training" must not be the grant that states standings. The
// subscription's status is DERIVED by the apply trigger, and Decision D4
// lives there too: a resumed pause moves committed_until out by exactly the
// days frozen, so pausing is a pause and never an escape hatch from a term.
// One mutation serves the desk and the member — the member's reach pins
// person_id to the caller, and the trigger verifies it owns the subscription.
export const subscriptionPause: MutationEntry = {
  fingerprint: 'subscriptions/pause',
  intent: 'Freeze a subscription — the clock on its commitment stops with it',
  mutation: {
    op: 'insert',
    table: 'subscription_pauses',
    values: { subscription_id: { $context: 'subscriptionId' } },
  },
};

// The flag is all the screen may say; the date and the arithmetic are the
// database's. Idempotent by the WHERE: resuming what is not paused matches
// nothing.
export const subscriptionResume: MutationEntry = {
  fingerprint: 'subscriptions/resume',
  intent: 'Resume a paused subscription, moving its commitment out by the days frozen',
  mutation: {
    op: 'update',
    table: 'subscription_pauses',
    set: { resumed: true },
    where: {
      and: [
        { eq: ['subscription_pauses.subscription_id', { $context: 'subscriptionId' }] },
        { eq: ['subscription_pauses.resumed', false] },
      ],
    },
  },
};

// Reversible, because everything at a desk is: somebody says they are leaving,
// then they are not. The row is MARKED, never deleted — there is no delete verb
// anywhere in this app, and a notice that was given and taken back is still a
// thing that happened. The ledger trigger recomputes the subscription's standing
// notice from that, and the terms trigger recomputes the leaving date
// from that, so no second place is left holding a stale answer.
export const subscriptionWithdrawNotice: MutationEntry = {
  fingerprint: 'subscriptions/withdraw-notice',
  intent: 'Take back a notice somebody changed their mind about',
  mutation: {
    op: 'update',
    table: 'subscription_notices',
    set: { withdrawn: true },
    where: {
      and: [
        { eq: ['subscription_notices.subscription_id', { $context: 'subscriptionId' }] },
        { eq: ['subscription_notices.withdrawn', false] },
      ],
    },
  },
};

// ── SELLING A PASS ───────────────────────────────────────────
//
// The drop-in and the ten-pack: one mutation, because a drop-in IS a pass
// with one credit. Credits and expiry are stamped from the offering by the
// trigger — the terms they were SOLD, not the terms on sale later. Attending
// is what spends a credit (schema.ts: spend_pass_credit), so nothing here
// needs to know how the pass will be used.
export const passSell: MutationEntry = {
  fingerprint: 'passes/sell',
  intent: 'Sell a person a class pass or a single drop-in, saying how it was paid',
  mutation: {
    op: 'insert',
    table: 'passes',
    values: {
      person_id: { $context: 'personId' },
      offering_id: { $context: 'offeringId' },
      paid_via: { $context: 'paidVia' },
    },
  },
};

// What a person holds in credits — the desk's answer to "how many do I have
// left?", and the People lens behind "Passes".
export const passesForPerson: CacheEntry = {
  fingerprint: 'passes/for-person',
  intent: 'The passes a person holds at this studio, newest first',
  shape: [{ pass_id: '', name: '', credits_display: '', state_label: '', state_tone: '', purchased_display: '', expires_display: '' }],
  dsl: {
    from: ['passes', 'offerings'],
    fields: [
      { field: 'passes.id', as: 'pass_id' },
      'passes.credits_total',
      'passes.credits_used',
      'passes.status',
      'passes.purchased_on',
      'passes.expires_on',
      { field: 'offerings.name', as: 'name' },
    ],
    filter: { eq: ['passes.person_id', { $context: 'personId' }] },
    sort: [{ field: 'passes.purchased_on', dir: 'desc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        pass_id: { $get: { from: { $var: 'r' }, path: ['pass_id'] } },
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        credits_display: pattern('{n} of {total} left', {
          n: { $sub: [{ $get: { from: { $var: 'r' }, path: ['credits_total'] } }, { $get: { from: { $var: 'r' }, path: ['credits_used'] } }] },
          total: { $get: { from: { $var: 'r' }, path: ['credits_total'] } },
        }),
        state_label: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'used_up'] }, then: 'Used up' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'refunded'] }, then: 'Refunded' },
            ],
            else: 'Active',
          },
        },
        state_tone: {
          $case: {
            branches: [{ when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'active'] }, then: 'good' }],
            else: 'neutral',
          },
        },
        purchased_display: dateText({ $get: { from: { $var: 'r' }, path: ['purchased_on'] } }),
        expires_display: dateText({ $get: { from: { $var: 'r' }, path: ['expires_on'], fallback: { $const: null } } }),
      },
    },
  },
};
