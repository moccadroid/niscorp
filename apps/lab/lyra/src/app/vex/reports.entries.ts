import type { CacheEntry, MutationEntry } from './index';
import { priceText } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });

// Peak hours — the figure that tells a studio when to add a class and when to
// stop paying somebody to stand in an empty room.
export const attendanceByHour: CacheEntry = {
  fingerprint: 'reports/attendance-by-hour',
  intent: 'How many check-ins this studio has had, by hour of day',
  shape: [{ hour_key: 0, hour_display: '', total: 0 }],
  dsl: {
    from: ['check_ins'],
    fields: ['check_ins.hour_key'],
    aggregate: { total: { count: 'check_ins.id' } },
    filter: { and: [{ gte: ['check_ins.held_on', { $context: 'from' }] }, { lte: ['check_ins.held_on', { $context: 'to' }] }] },
    groupBy: ['check_ins.hour_key'],
    sort: [{ field: 'check_ins.hour_key', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        hour_key: row('hour_key'),
        hour_display: { $join: { parts: [row('hour_key'), ':00'], sep: '' } },
        total: row('total'),
      },
    },
  },
};

// The trend. Grouped on the ISO week the row was written into, newest last so a
// chart reads left to right.
export const attendanceByWeek: CacheEntry = {
  fingerprint: 'reports/attendance-by-week',
  intent: 'Class attendance at this studio, by week',
  shape: [{ week_key: '', total: 0 }],
  dsl: {
    from: ['check_ins', 'class_sessions'],
    fields: ['class_sessions.week_key'],
    aggregate: { total: { count: 'check_ins.id' } },
    filter: { and: [{ gte: ['check_ins.held_on', { $context: 'from' }] }, { lte: ['check_ins.held_on', { $context: 'to' }] }] },
    groupBy: ['class_sessions.week_key'],
    sort: [{ field: 'class_sessions.week_key', dir: 'asc' }],
  },
};

export const attendanceByProgram: CacheEntry = {
  fingerprint: 'reports/attendance-by-program',
  intent: 'Class attendance at this studio, by program',
  shape: [{ program_name: '', tone: '', total: 0 }],
  dsl: {
    from: ['check_ins', 'class_sessions', 'programs'],
    fields: [
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'tone' },
    ],
    aggregate: { total: { count: 'check_ins.id' } },
    filter: { and: [{ gte: ['check_ins.held_on', { $context: 'from' }] }, { lte: ['check_ins.held_on', { $context: 'to' }] }] },
    groupBy: ['programs.name', 'programs.colour'],
    sort: [{ field: 'programs.name', dir: 'asc' }],
  },
};

// How the book of subscriptions splits. The figure an owner opens the app
// for. Prospect and pass-holder counts are their own reads — the People
// lenses' `people/count` entry, under its own lens — because they are derived over
// relationships, not states of one table.
export const membersByStatus: CacheEntry = {
  fingerprint: 'reports/members-by-status',
  intent: 'How many subscriptions this studio has in each state',
  shape: [{ status: '', total: 0 }],
  dsl: {
    from: ['subscriptions'],
    fields: ['subscriptions.status'],
    aggregate: { total: { count: 'subscriptions.id' } },
    groupBy: ['subscriptions.status'],
    sort: [{ field: 'subscriptions.status', dir: 'asc' }],
  },
};

// ─── offerings ───────────────────────────────────────────────

export const offeringCreate: MutationEntry = {
  fingerprint: 'offerings/create',
  intent: 'Put something on sale — a plan or a pass',
  mutation: {
    op: 'insert',
    table: 'offerings',
    values: {
      name: { $context: 'name' },
      kind: { $context: 'kind' },
      price_cents: { $context: 'priceCents' },
      interval: { $context: 'interval' },
      class_allowance: { $context: 'classAllowance' },
      // WHAT A PLAN COMMITS SOMEBODY TO — the half of a plan that sat in the
      // schema, seeded with real terms, read by the retention screen, and
      // writable by nothing. "Twelve months, one month's notice" and "rolling"
      // are different products at the same price.
      minimum_term_months: { $context: 'minimumTermMonths' },
      notice_days: { $context: 'noticeDays' },
      // The pass half: how many classes, and how long they live. NULL for a
      // recurring plan.
      credits: { $context: 'credits' },
      valid_days: { $context: 'validDays' },
    },
  },
};

export const offeringUpdate: MutationEntry = {
  fingerprint: 'offerings/update',
  intent: 'Change an offering',
  mutation: {
    op: 'update',
    table: 'offerings',
    set: {
      name: { $context: 'name' },
      price_cents: { $context: 'priceCents' },
      interval: { $context: 'interval' },
      class_allowance: { $context: 'classAllowance' },
      // Editing the terms changes what is ON SALE. Nobody already signed moves:
      // `committed_until` was stamped onto their subscription at sign-up and the
      // trigger never restamps it (schema.ts), which is the same rule the price
      // override follows.
      minimum_term_months: { $context: 'minimumTermMonths' },
      notice_days: { $context: 'noticeDays' },
      credits: { $context: 'credits' },
      valid_days: { $context: 'validDays' },
    },
    where: { eq: ['offerings.id', { $context: 'offeringId' }] },
  },
};

// Retiring an offering, never deleting it: subscriptions and passes point at
// it, and a studio that drops a price still has people paying the old one.
// One verb, the flag as its argument — see `templates/set-active`.
export const offeringSetActive: MutationEntry = {
  fingerprint: 'offerings/set-active',
  intent: 'Stop offering something, or offer it again — everybody already on it keeps their price',
  mutation: {
    op: 'update',
    table: 'offerings',
    set: { active: { $context: 'active' } },
    where: { eq: ['offerings.id', { $context: 'offeringId' }] },
  },
};

// How many people are on each offering — the other half of the price list, and
// the reason retiring beats deleting.
export const planUptake: CacheEntry = {
  fingerprint: 'reports/plan-uptake',
  intent: 'How many active subscriptions each offering carries at this studio',
  shape: [{ plan_name: '', price_display: '', total: 0 }],
  dsl: {
    from: ['subscriptions', 'offerings'],
    fields: [
      { field: 'offerings.name', as: 'plan_name' },
      'offerings.price_cents',
      'offerings.currency',
    ],
    aggregate: { total: { count: 'subscriptions.id' } },
    groupBy: ['offerings.name', 'offerings.price_cents', 'offerings.currency'],
    filter: { eq: ['subscriptions.status', 'active'] },
    sort: [{ field: 'offerings.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        plan_name: row('plan_name'),
        price_display: priceText(row('price_cents'), row('currency')),
        total: row('total'),
      },
    },
  },
};
