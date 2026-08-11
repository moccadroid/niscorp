import type { CacheEntry, MutationEntry } from './index';
import { priceText } from '@lyra/app/prisms/format.prism';

// WHAT THE STUDIO LOOKS LIKE FROM ABOVE.
//
// Every figure here is grouped on a DENORMALISED column — `hour_key`,
// `week_key` — and that is the whole reason those columns exist. Vex has no
// date functions, so "attendance by hour" and "attendance by week" cannot be
// expressed as `date_trunc` in a query; the bucket is written when the row is,
// and the report groups on it.
//
// The trade is explicit: a bucket is fixed at write time, so changing what a
// week means later means a backfill. For a studio timetable that is a fine
// price, and it keeps every report a single grouped read with no post-processing.

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
    // BOUNDED BY THE CALLER'S WINDOW. Every attendance report here was
    // all-time: a studio three years old read 'busiest hours' over three years,
    // which answers a question nobody asks. The dates are context, so ONE
    // fingerprint serves every window — the screen changes what it passes, not
    // which read it calls.
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

// Which streams people actually turn up for. A studio running six Vinyasa slots
// and one Foundations to the same headcount is a studio with a timetable
// problem, and this is the read that says so.
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

// How the roll splits. The figure an owner opens the app for.
export const membersByStatus: CacheEntry = {
  fingerprint: 'reports/members-by-status',
  intent: 'How many memberships this studio has in each state',
  shape: [{ status: '', total: 0 }],
  dsl: {
    from: ['memberships'],
    fields: ['memberships.status'],
    aggregate: { total: { count: 'memberships.id' } },
    groupBy: ['memberships.status'],
    sort: [{ field: 'memberships.status', dir: 'asc' }],
  },
};

// ─── plans ───────────────────────────────────────────────────

export const planCreate: MutationEntry = {
  fingerprint: 'plans/create',
  intent: 'Add a plan',
  mutation: {
    op: 'insert',
    table: 'plans',
    // No `id`: the database mints it, the same as every other create in this
    // application. A client that cannot author a primary key cannot collide
    // with one, and there is nothing to guess.
    values: {
      name: { $context: 'name' },
      price_cents: { $context: 'priceCents' },
      interval: { $context: 'interval' },
      class_allowance: { $context: 'classAllowance' },
    },
  },
};

export const planUpdate: MutationEntry = {
  fingerprint: 'plans/update',
  intent: 'Change a plan',
  mutation: {
    op: 'update',
    table: 'plans',
    set: {
      name: { $context: 'name' },
      price_cents: { $context: 'priceCents' },
      interval: { $context: 'interval' },
      class_allowance: { $context: 'classAllowance' },
    },
    where: { eq: ['plans.id', { $context: 'planId' }] },
  },
};

// Retiring a plan, never deleting it: subscriptions point at it, and a studio
// that drops a price still has people paying the old one.
export const planRetire: MutationEntry = {
  fingerprint: 'plans/retire',
  intent: 'Stop offering a plan, keeping everybody already on it',
  mutation: {
    op: 'update',
    table: 'plans',
    set: { active: false },
    where: { eq: ['plans.id', { $context: 'planId' }] },
  },
};

export const planRestore: MutationEntry = {
  fingerprint: 'plans/restore',
  intent: 'Offer a plan again',
  mutation: {
    op: 'update',
    table: 'plans',
    set: { active: true },
    where: { eq: ['plans.id', { $context: 'planId' }] },
  },
};

// How many people are on each plan — the other half of the price list, and the
// reason retiring beats deleting.
export const planUptake: CacheEntry = {
  fingerprint: 'reports/plan-uptake',
  intent: 'How many active subscriptions each plan carries at this studio',
  shape: [{ plan_name: '', price_display: '', total: 0 }],
  dsl: {
    from: ['subscriptions', 'plans'],
    fields: [
      { field: 'plans.name', as: 'plan_name' },
      'plans.price_cents',
    ],
    aggregate: { total: { count: 'subscriptions.id' } },
    groupBy: ['plans.name', 'plans.price_cents'],
    filter: { eq: ['subscriptions.status', 'active'] },
    sort: [{ field: 'plans.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        plan_name: row('plan_name'),
        price_display: priceText(row('price_cents')),
        total: row('total'),
      },
    },
  },
};
