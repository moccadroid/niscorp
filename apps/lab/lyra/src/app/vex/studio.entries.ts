import type { CacheEntry } from './index';
import { money } from '@lyra/app/prisms/format.prism';

// ─── one row, or none ────────────────────────────────────────
const rowText = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: '' } } });
const rowNum = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });

export const studioCurrent: CacheEntry = {
  fingerprint: 'studio/current',
  intent: "The signed-in principal's own studio",
  shape: { studio_id: '', name: '', slug: '', kind: '', timezone: '' },
  dsl: {
    from: ['studios'],
    fields: [{ field: 'studios.id', as: 'studio_id' }, 'studios.name', 'studios.slug', 'studios.kind', 'studios.timezone'],
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        studio_id: rowText('studio_id'),
        name: rowText('name'),
        slug: rowText('slug'),
        kind: rowText('kind'),
        timezone: rowText('timezone'),
      },
    },
  },
};

export const membersActiveCount: CacheEntry = {
  fingerprint: 'studio/members/active-count',
  intent: 'How many live subscriptions this studio has on the books',
  shape: { total: 0 },
  dsl: {
    from: ['subscriptions'],
    aggregate: { total: { count: 'subscriptions.id' } },
    filter: { eq: ['subscriptions.status', 'active'] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { total: rowNum('total') } } },
};

// Turnout today. Counts check-ins rather than bookings on purpose: the question
// a desk asks at 6pm is who actually walked in.
export const checkInsTodayCount: CacheEntry = {
  fingerprint: 'studio/check-ins/today-count',
  intent: 'How many people have checked in at this studio today',
  shape: { total: 0 },
  dsl: {
    from: ['check_ins'],
    aggregate: { total: { count: 'check_ins.id' } },
    filter: { eq: ['check_ins.held_on', { $scope: 'today' }] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { total: rowNum('total') } } },
};
