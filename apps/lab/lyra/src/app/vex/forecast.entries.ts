import type { CacheEntry } from './index';
import { dateText, money } from '@lyra/app/prisms/format.prism';

const one = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });
const row = (name: string) => ({ $get: { from: { $var: 's' }, path: [name] } });

// THE RUN RATE. Every active subscription, normalised to a month.
export const revenueExpected: CacheEntry = {
  fingerprint: 'studio/revenue/expected',
  intent: 'Normalised monthly revenue from every active subscription',
  shape: { monthly_display: '' },
  dsl: {
    from: ['subscriptions'],
    // MAX is not a guess: one currency per studio is a composite foreign key in
    // the schema, so every row in this scope agrees and MAX is that agreement.
    aggregate: { cents: { sum: 'subscriptions.monthly_cents' }, currency: { max: 'subscriptions.currency' } },
    // No interval filter. That filter WAS the bug — it read as "monthly plans
    // only" and meant "pretend the annual members are not there".
    filter: { eq: ['subscriptions.status', 'active'] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { monthly_display: money(one('cents'), one('currency')) } } },
};

// CONTRACTED. Inside a minimum term, so the studio may bank on it: leaving early
// does not end the obligation, which is the entire reason a studio sells terms.
export const revenueCommitted: CacheEntry = {
  fingerprint: 'studio/revenue/committed',
  intent: 'Monthly revenue under a minimum term that has not expired',
  shape: { monthly_display: '' },
  dsl: {
    from: ['subscriptions'],
    // MAX is not a guess: one currency per studio is a composite foreign key in
    // the schema, so every row in this scope agrees and MAX is that agreement.
    aggregate: { cents: { sum: 'subscriptions.monthly_cents' }, currency: { max: 'subscriptions.currency' } },
    filter: {
      and: [
        { eq: ['subscriptions.status', 'active'] },
        { gte: ['subscriptions.committed_until', { $scope: 'today' }] },
      ],
    },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { monthly_display: money(one('cents'), one('currency')) } } },
};

export const revenueLeaving: CacheEntry = {
  fingerprint: 'studio/revenue/leaving',
  intent: 'Monthly revenue from subscriptions that have given notice',
  shape: { monthly_display: '' },
  dsl: {
    from: ['subscriptions'],
    // MAX is not a guess: one currency per studio is a composite foreign key in
    // the schema, so every row in this scope agrees and MAX is that agreement.
    aggregate: { cents: { sum: 'subscriptions.monthly_cents' }, currency: { max: 'subscriptions.currency' } },
    filter: {
      and: [
        { eq: ['subscriptions.status', 'active'] },
        { gte: ['subscriptions.ends_on', { $scope: 'today' }] },
      ],
    },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { monthly_display: money(one('cents'), one('currency')) } } },
};

export const revenueAtRisk: CacheEntry = {
  fingerprint: 'studio/revenue/at-risk',
  intent: 'Subscriptions that have given notice, and when they end',
  shape: [{ subscription_id: '', person_name: '', plan_name: '', value_display: '', ends_display: '', notice_display: '' }],
  dsl: {
    from: ['subscriptions', 'people', 'offerings'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      'subscriptions.monthly_cents',
      'subscriptions.currency',
      'subscriptions.ends_on',
      'subscriptions.notice_given_on',
      { field: 'people.name', as: 'person_name' },
      { field: 'offerings.name', as: 'plan_name' },
    ],
    filter: {
      and: [
        { eq: ['subscriptions.status', 'active'] },
        { gte: ['subscriptions.ends_on', { $scope: 'today' }] },
      ],
    },
    // Soonest first: the one you can still do something about is at the top.
    sort: [{ field: 'subscriptions.ends_on', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 's',
      body: {
        subscription_id: row('subscription_id'),
        person_name: row('person_name'),
        plan_name: row('plan_name'),
        value_display: money(row('monthly_cents'), row('currency')),
        ends_display: dateText(row('ends_on')),
        notice_display: dateText(row('notice_given_on')),
      },
    },
  },
};
