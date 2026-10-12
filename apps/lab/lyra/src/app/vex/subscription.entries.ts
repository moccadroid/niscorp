import type { CacheEntry, MutationEntry } from './index';
import { dateText, money, pattern } from '@lyra/app/prisms/format.prism';

const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

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
  // With no minimum term the trigger stamps `committed_until = started_on`,
  // which is not a commitment to show.
  committed_display: {
    $case: {
      branches: [{ when: one('minimum_term_months'), then: dateText(one('committed_until', null)) }],
      else: '',
    },
  },
  ends_display: dateText(one('ends_on', null)),
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

// No person filter: the personal reach pins the rows to whoever is asking.
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

// `amount` takes the subscription's own `price_cents` over the offering's, so
// somebody on a rate the offering no longer sells keeps it.
export const subscriptionBillable: CacheEntry = {
  fingerprint: 'subscriptions/billable',
  intent: 'What a person should be charged, as numbers a payment provider can use',
  shape: { subscription_id: '', offering_id: '', plan_name: '', amount: 0, currency: '', interval: '', interval_count: 0, status: '', paid_via: '', person_id: '', person_name: '', joining_fee_id: '' },
  dsl: {
    from: ['subscriptions', 'offerings', 'people'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      'subscriptions.status',
      'subscriptions.currency',
      'subscriptions.paid_via',
      { field: 'offerings.id', as: 'offering_id' },
      { field: 'offerings.name', as: 'plan_name' },
      'offerings.interval',
      'offerings.joining_fee_id',
      'offerings.interval_count',
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
        interval_count: one('interval_count', 1),
        status: one('status'),
        paid_via: one('paid_via'),
        person_id: one('person_id'),
        person_name: one('person_name'),
        joining_fee_id: one('joining_fee_id'),
      },
    },
  },
};

export const offeringPrice: CacheEntry = {
  fingerprint: 'offerings/price',
  intent: 'What one thing on the price list costs, as numbers a payment provider can use',
  shape: { offering_id: '', name: '', kind: '', amount: 0, currency: '', credits: 0, active: false },
  dsl: {
    from: ['offerings'],
    fields: [
      { field: 'offerings.id', as: 'offering_id' },
      'offerings.name',
      'offerings.kind',
      { field: 'offerings.price_cents', as: 'amount' },
      'offerings.currency',
      'offerings.credits',
      'offerings.active',
    ],
    filter: { and: [{ eq: ['offerings.id', { $context: 'offeringId' }] }, { eq: ['offerings.active', true] }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        offering_id: one('offering_id'),
        name: one('name'),
        kind: one('kind'),
        amount: one('amount', 0),
        currency: one('currency'),
        credits: one('credits', 0),
        active: one('active', false),
      },
    },
  },
};

export const offeringsPurchasable: CacheEntry = {
  fingerprint: 'offerings/purchasable',
  intent: 'Passes and drop-ins a member can buy for themselves right now',
  shape: [{ offering_id: '', kind: '', name: '', price_display: '', allowance_display: '' }],
  dsl: {
    from: ['offerings'],
    fields: [
      { field: 'offerings.id', as: 'offering_id' },
      'offerings.kind',
      'offerings.name',
      'offerings.price_cents',
      'offerings.currency',
      'offerings.credits',
      'offerings.valid_days',
    ],
    filter: {
      and: [
        // A list, not "not recurring", which would admit every later kind: a
        // course block bought outright takes the money and hands back no seat.
        { in: ['offerings.kind', ['pass', 'one_off']] },
        { eq: ['offerings.active', true] },
        { gt: ['offerings.price_cents', 0] },
      ],
    },
    sort: [{ field: 'offerings.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'p',
      body: {
        offering_id: { $get: { from: { $var: 'p' }, path: ['offering_id'] } },
        kind: { $get: { from: { $var: 'p' }, path: ['kind'] } },
        name: { $get: { from: { $var: 'p' }, path: ['name'] } },
        price_display: money({ $get: { from: { $var: 'p' }, path: ['price_cents'] } }, { $get: { from: { $var: 'p' }, path: ['currency'] } }),
        allowance_display: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'p' }, path: ['kind'] } }, 'one_off'] }, then: 'One-off' },
              { when: { $eq: [{ $get: { from: { $var: 'p' }, path: ['credits'] } }, 1] }, then: 'Single class' },
            ],
            else: pattern('{n} classes', { n: { $get: { from: { $var: 'p' }, path: ['credits'] } } }),
          },
        },
      },
    },
  },
};

export const coursePrice: CacheEntry = {
  fingerprint: 'courses/price',
  intent: 'What a course block costs, and whether there is still a seat',
  shape: { course_id: '', name: '', amount: 0, currency: '', capacity: 0, enrolled_count: 0, seats_left: 0 },
  dsl: {
    from: ['courses', 'offerings'],
    fields: [
      { field: 'courses.id', as: 'course_id' },
      'courses.name',
      { field: 'offerings.price_cents', as: 'amount' },
      'offerings.currency',
      'courses.capacity',
      'courses.enrolled_count',
    ],
    compute: { seats_left: { subtract: ['courses.capacity', 'courses.enrolled_count'] } },
    filter: { eq: ['courses.id', { $context: 'courseId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        course_id: one('course_id'),
        name: one('name'),
        amount: one('amount', 0),
        currency: one('currency'),
        capacity: one('capacity', 0),
        enrolled_count: one('enrolled_count', 0),
        seats_left: one('seats_left', 0),
      },
    },
  },
};

export const subscriptionNames: CacheEntry = {
  fingerprint: 'subscriptions/names',
  intent: 'Who these subscriptions belong to, for a screen that holds only their ids',
  shape: [{ subscription_id: '', person_name: '' }],
  dsl: {
    from: ['subscriptions', 'people'],
    fields: [{ field: 'subscriptions.id', as: 'subscription_id' }, { field: 'people.name', as: 'person_name' }],
    // Only ids the caller already holds: this cannot be used to walk the roll.
    filter: { in: ['subscriptions.id', { $context: 'subscriptionIds' }] },
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'n',
      body: {
        subscription_id: { $get: { from: { $var: 'n' }, path: ['subscription_id'] } },
        person_name: { $get: { from: { $var: 'n' }, path: ['person_name'] } },
      },
    },
  },
};

export const subscriptionsOfPerson: CacheEntry = {
  fingerprint: 'subscriptions/of-person',
  intent: 'The subscription ids a person holds at this studio',
  shape: [{ subscription_id: '' }],
  dsl: {
    from: ['subscriptions'],
    fields: [{ field: 'subscriptions.id', as: 'subscription_id' }],
    // Cancelled ones included: what somebody paid stays theirs after they leave.
    filter: { eq: ['subscriptions.person_id', { $context: 'personId' }] },
  },
  mapping: {
    $map: { over: { $ref: '$.result' }, as: 'p', body: { subscription_id: { $get: { from: { $var: 'p' }, path: ['subscription_id'] } } } },
  },
};

export const subscriptionsLeaving: CacheEntry = {
  fingerprint: 'subscriptions/leaving',
  intent: 'Subscriptions billed by a provider that have a leaving date, so the provider can be told to stop',
  shape: [{ subscription_id: '', ends_on: '', status: '' }],
  dsl: {
    from: ['subscriptions'],
    fields: [{ field: 'subscriptions.id', as: 'subscription_id' }, 'subscriptions.ends_on', 'subscriptions.status'],
    filter: {
      and: [
        { eq: ['subscriptions.paid_via', 'stripe'] },
        { isNotNull: 'subscriptions.ends_on' },
      ],
    },
    sort: [{ field: 'subscriptions.ends_on', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'l',
      body: {
        subscription_id: { $get: { from: { $var: 'l' }, path: ['subscription_id'] } },
        ends_on: { $get: { from: { $var: 'l' }, path: ['ends_on'] } },
        status: { $get: { from: { $var: 'l' }, path: ['status'] } },
      },
    },
  },
};

// The trigger stamps the terms from the offering and `started_on` from the
// studio's clock: a browser does not say when a contract began.
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

// Its own table so that giving notice is its own grant: a charter grant is
// table.verb, and the payments rung holds `subscriptions.write.update`. The
// trigger stamps `given_on` and computes the leaving date: nobody backdates.
export const subscriptionGiveNotice: MutationEntry = {
  fingerprint: 'subscriptions/give-notice',
  intent: 'Record that a member has given notice, dated by the studio’s own clock',
  mutation: {
    op: 'insert',
    table: 'subscription_notices',
    values: { subscription_id: { $context: 'subscriptionId' } },
  },
};

// An assertion, not a delta: a payment provider redelivers, retries and
// reorders, and applying this twice or out of order means the same thing.
// Notice, terms, the offering and `paid_via` are absent on purpose.
export const subscriptionAssert: MutationEntry = {
  fingerprint: 'subscriptions/assert',
  intent: 'State a subscription’s standing as billing currently understands it',
  mutation: {
    op: 'update',
    table: 'subscriptions',
    set: {
      status: { $context: 'status' },
      paid_until: { $context: 'paidUntil' },
      price_cents: { $context: 'priceCents' },
    },
    where: { eq: ['subscriptions.id', { $context: 'subscriptionId' }] },
  },
};

export const subscriptionPaidByProvider: MutationEntry = {
  fingerprint: 'subscriptions/paid-by-provider',
  intent: 'Record that a payment provider now collects this subscription',
  mutation: {
    op: 'update',
    table: 'subscriptions',
    set: { paid_via: 'stripe' },
    where: { eq: ['subscriptions.id', { $context: 'subscriptionId' }] },
  },
};

// The apply trigger derives the subscription's status, and a resumed pause
// moves `committed_until` out by the days frozen. At the member's reach the
// trigger verifies the pinned `person_id` owns the subscription.
export const subscriptionPause: MutationEntry = {
  fingerprint: 'subscriptions/pause',
  intent: 'Freeze a subscription — the clock on its commitment stops with it',
  mutation: {
    op: 'insert',
    table: 'subscription_pauses',
    values: { subscription_id: { $context: 'subscriptionId' } },
  },
};

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
      // NULL from a desk; the provider's checkout session id when a member
      // bought it. The session, not the delivery: one purchase can arrive as
      // two events, and a reference naming the delivery would sell two passes.
      purchase_ref: { $context: 'purchaseRef' },
    },
    onConflict: { target: ['studio_id', 'purchase_ref'] },
  },
};

// The amount is not sent: the trigger stamps it from the offering at the sale,
// so no caller names a number and a later price change does not rewrite it.
export const purchaseRecord: MutationEntry = {
  fingerprint: 'purchases/record',
  intent: 'Record that a person bought something sold once, saying how it was paid',
  mutation: {
    op: 'insert',
    table: 'purchases',
    values: {
      person_id: { $context: 'personId' },
      offering_id: { $context: 'offeringId' },
      paid_via: { $context: 'paidVia' },
      purchase_ref: { $context: 'purchaseRef' },
    },
    onConflict: { target: ['studio_id', 'purchase_ref'] },
  },
};

export const purchasesForPerson: CacheEntry = {
  fingerprint: 'purchases/for-person',
  intent: 'Things this person has bought outright, newest first',
  shape: [{ purchase_id: '', name: '', amount_display: '', paid_via_display: '', purchased_display: '' }],
  dsl: {
    from: ['purchases', 'offerings'],
    fields: [
      { field: 'purchases.id', as: 'purchase_id' },
      'purchases.price_cents',
      'purchases.currency',
      'purchases.paid_via',
      'purchases.purchased_on',
      { field: 'offerings.name', as: 'name' },
    ],
    filter: { eq: ['purchases.person_id', { $context: 'personId' }] },
    sort: [{ field: 'purchases.purchased_on', dir: 'desc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'b',
      body: {
        purchase_id: { $get: { from: { $var: 'b' }, path: ['purchase_id'] } },
        name: { $get: { from: { $var: 'b' }, path: ['name'] } },
        amount_display: money({ $get: { from: { $var: 'b' }, path: ['price_cents'] } }, { $get: { from: { $var: 'b' }, path: ['currency'] } }),
        paid_via_display: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'b' }, path: ['paid_via'] } }, 'stripe'] }, then: 'Card, online' },
              { when: { $eq: [{ $get: { from: { $var: 'b' }, path: ['paid_via'] } }, 'comp'] }, then: 'Complimentary' },
              { when: { $eq: [{ $get: { from: { $var: 'b' }, path: ['paid_via'] } }, 'free'] }, then: 'Free' },
            ],
            else: 'Paid at the studio',
          },
        },
        purchased_display: dateText({ $get: { from: { $var: 'b' }, path: ['purchased_on'] } }),
      },
    },
  },
};

// Names the person, for a payment integration that has no session. It needs
// no purchase reference: `UNIQUE (course_id, person_id)` lands a redelivery on
// the seat already held.
export const enrolPerson: MutationEntry = {
  fingerprint: 'enrolments/enrol',
  intent: 'Put a named person on a course, saying how it was paid',
  mutation: {
    op: 'insert',
    table: 'enrolments',
    values: {
      person_id: { $context: 'personId' },
      course_id: { $context: 'courseId' },
      paid_via: { $context: 'paidVia' },
    },
  },
};

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
