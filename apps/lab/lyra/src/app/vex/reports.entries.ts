import type { CacheEntry, MutationEntry } from './index';
import { dateText, priceText } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });

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

export const attendanceByWeek: CacheEntry = {
  fingerprint: 'reports/attendance-by-week',
  intent: 'Class attendance at this studio, by week',
  shape: [{ week_key: '', week_display: '', total: 0 }],
  dsl: {
    from: ['check_ins', 'class_sessions'],
    fields: ['class_sessions.week_key'],
    aggregate: { total: { count: 'check_ins.id' }, week_start: { min: 'check_ins.held_on' } },
    filter: { and: [{ gte: ['check_ins.held_on', { $context: 'from' }] }, { lte: ['check_ins.held_on', { $context: 'to' }] }] },
    groupBy: ['class_sessions.week_key'],
    sort: [{ field: 'class_sessions.week_key', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        week_key: row('week_key'),
        week_display: dateText(row('week_start')),
        total: row('total'),
      },
    },
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

export const membersByStatus: CacheEntry = {
  fingerprint: 'reports/members-by-status',
  intent: 'How many subscriptions this studio has in each state',
  shape: [{ status: '', status_display: '', status_tone: '', total: 0 }],
  dsl: {
    from: ['subscriptions'],
    fields: ['subscriptions.status'],
    aggregate: { total: { count: 'subscriptions.id' } },
    groupBy: ['subscriptions.status'],
    sort: [{ field: 'subscriptions.status', dir: 'asc' }],
  },
  // Not `standingLabel`: its else-arm is Prospect, and a cancelled
  // subscription is not a prospect.
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        status: row('status'),
        status_display: {
          $case: {
            branches: [
              { when: { $eq: [row('status'), 'active'] }, then: 'Active' },
              { when: { $eq: [row('status'), 'paused'] }, then: 'Paused' },
            ],
            else: 'Cancelled',
          },
        },
        status_tone: { $case: { branches: [{ when: { $eq: [row('status'), 'active'] }, then: 'good' }], else: 'neutral' } },
        total: row('total'),
      },
    },
  },
};

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
      interval_count: { $context: 'intervalCount' },
      class_allowance: { $context: 'classAllowance' },
      minimum_term_months: { $context: 'minimumTermMonths' },
      notice_days: { $context: 'noticeDays' },
      credits: { $context: 'credits' },
      valid_days: { $context: 'validDays' },
      // The trigger keeps the target a one-off, and the pair foreign key keeps
      // it inside this studio.
      joining_fee_id: { $context: 'joiningFeeId' },
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
      interval_count: { $context: 'intervalCount' },
      class_allowance: { $context: 'classAllowance' },
      // Changes what is on sale only: `committed_until` was stamped onto each
      // subscription at sign-up and the trigger never restamps it.
      minimum_term_months: { $context: 'minimumTermMonths' },
      notice_days: { $context: 'noticeDays' },
      credits: { $context: 'credits' },
      valid_days: { $context: 'validDays' },
      joining_fee_id: { $context: 'joiningFeeId' },
    },
    where: { eq: ['offerings.id', { $context: 'offeringId' }] },
  },
};

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

export const offeringDelete: MutationEntry = {
  fingerprint: 'offerings/delete',
  intent: 'Remove something nobody ever held — a mistake, not a product',
  mutation: {
    op: 'delete',
    table: 'offerings',
    where: { eq: ['offerings.id', { $context: 'offeringId' }] },
  },
};

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
