import type { CacheEntry } from './index';
import { money } from '@lyra/app/prisms/format.prism';

// The studio, and the figures a landing screen leads with.
//
// Every one of these is scoped engine-side: `studios` matches on `id`, the rest
// on `studio_id`, so none of them carries a studio parameter and none of them
// could be made to answer for somebody else's.

// ─── ONE ROW, OR NONE ────────────────────────────────────────
// A non-array `shape` tells vex to map the FIRST row, handing `$.result` as
// that row — or NULL when nothing matched. Prism's `$get` throws on null unless
// the node carries a `fallback`, so a detail read that finds nothing would
// answer 500 instead of "nothing". Finding no row is ORDINARY here (a principal
// whose studio was deleted, a scope that resolved empty), so every field states
// its own absent value.
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

// How many people are on the books. Active and trialling only — a lapsed
// member is not a member, and a headline figure that counts them is a figure
// that flatters. `count` with no groupBy returns a single aggregated row.
export const membersActiveCount: CacheEntry = {
  fingerprint: 'studio/members/active-count',
  intent: 'How many memberships at this studio are active or trialling',
  shape: { total: 0 },
  dsl: {
    from: ['memberships'],
    aggregate: { total: { count: 'memberships.id' } },
    filter: { in: ['memberships.status', ['active', 'trialling']] },
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
// `studio/revenue/expected` used to live here. It moved to `forecast.entries`
// with the two figures it was always missing — what is contracted, and what has
// given notice — because one number called "expected" was answering a question
// nobody asked: it summed the price list for monthly plans and left every annual
// member out of the total.

