import type { CacheEntry } from './index';
import { dateText, money } from '@lyra/app/prisms/format.prism';

// WHAT THE STUDIO WILL EARN, AND HOW MUCH OF IT IS ACTUALLY PROMISED.
//
// The figure this replaces summed `plans.price_cents` for subscriptions on a
// plan with `interval = 'month'`. Two things were wrong with it and both were
// invisible:
//
//   1. ANNUAL MEMBERS WERE EXCLUDED ENTIRELY. Not undercounted — filtered out.
//      A studio whose best customers pay yearly saw a number that left them out.
//   2. It read the PRICE LIST, not what people pay. Everybody grandfathered onto
//      an old rate was counted at today's price.
//
// Both are fixed at the row: `subscriptions.monthly_cents` is the normalised
// value of what THIS person pays, maintained by trigger because dividing by
// twelve is arithmetic a closed mutation grammar cannot say.
//
// The three figures below are one question asked three ways, and a studio needs
// all three: what comes in a normal month, how much of it is contractually
// owed, and how much is walking out of the door.

const one = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });
const row = (name: string) => ({ $get: { from: { $var: 's' }, path: [name] } });

// THE RUN RATE. Every active subscription, normalised to a month.
export const revenueExpected: CacheEntry = {
  fingerprint: 'studio/revenue/expected',
  intent: 'Normalised monthly revenue from every active subscription',
  shape: { monthly_display: '' },
  dsl: {
    from: ['subscriptions'],
    aggregate: { cents: { sum: 'subscriptions.monthly_cents' } },
    // No interval filter. That filter WAS the bug — it read as "monthly plans
    // only" and meant "pretend the annual members are not there".
    filter: { eq: ['subscriptions.status', 'active'] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { monthly_display: money(one('cents')) } } },
};

// CONTRACTED. Inside a minimum term, so the studio may bank on it: leaving early
// does not end the obligation, which is the entire reason a studio sells terms.
export const revenueCommitted: CacheEntry = {
  fingerprint: 'studio/revenue/committed',
  intent: 'Monthly revenue under a minimum term that has not expired',
  shape: { monthly_display: '' },
  dsl: {
    from: ['subscriptions'],
    aggregate: { cents: { sum: 'subscriptions.monthly_cents' } },
    filter: {
      and: [
        { eq: ['subscriptions.status', 'active'] },
        { gte: ['subscriptions.committed_until', { $scope: 'today' }] },
      ],
    },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { monthly_display: money(one('cents')) } } },
};

// LEAVING. Notice given, not yet gone — still paying today, and gone from the
// run rate on a date that is already known. This is the number that makes a
// forecast a forecast rather than a snapshot.
export const revenueLeaving: CacheEntry = {
  fingerprint: 'studio/revenue/leaving',
  intent: 'Monthly revenue from subscriptions that have given notice',
  shape: { monthly_display: '' },
  dsl: {
    from: ['subscriptions'],
    aggregate: { cents: { sum: 'subscriptions.monthly_cents' } },
    filter: {
      and: [
        { eq: ['subscriptions.status', 'active'] },
        { gte: ['subscriptions.ends_on', { $scope: 'today' }] },
      ],
    },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { monthly_display: money(one('cents')) } } },
};

// WHO, not just how much. A number a studio cannot act on is a number it reads
// once — the point of knowing €119 is leaving is knowing whose €119 it is and
// that there are three weeks left to change their mind.
export const revenueAtRisk: CacheEntry = {
  fingerprint: 'studio/revenue/at-risk',
  intent: 'Subscriptions that have given notice, and when they end',
  shape: [{ subscription_id: '', person_name: '', plan_name: '', value_display: '', ends_display: '', notice_display: '' }],
  dsl: {
    from: ['subscriptions', 'memberships', 'people', 'plans'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      'subscriptions.monthly_cents',
      'subscriptions.ends_on',
      'subscriptions.notice_given_on',
      { field: 'people.name', as: 'person_name' },
      { field: 'plans.name', as: 'plan_name' },
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
        value_display: money(row('monthly_cents')),
        ends_display: dateText(row('ends_on')),
        notice_display: dateText(row('notice_given_on')),
      },
    },
  },
};
