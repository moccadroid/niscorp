import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── queries from words ──
//
// A request in plain words is answered by a fingerprint: an earlier request's
// stored query, replayed, or a new one the model writes under the caller's own
// policy. These rows remember which — the router reads them to know what has
// been run before, and the projector counts them.

// What the router may send a new request to: every request that got a query of
// its own, newest first. Read as the caller.
export const queriesKnown: SeedEntry = {
  fingerprint: 'queries/known',
  intent: 'Requests answered by a query of their own, with the fingerprint and shape they replay by, newest first',
  shape: [{ request: '', fingerprint: '', shape: '' }],
  dsl: {
    from: ['queries'],
    fields: ['queries.request', 'queries.fingerprint', 'queries.shape'],
    filter: { eq: ['queries.how', 'generated'] },
    sort: [{ field: 'queries.run_at', dir: 'desc' }],
    limit: 200,
  },
};

// How many queries were answered each way — the projector's tally. Counts
// only: the words were written by people and do not go up on the wall. A way
// nothing has been answered yet has no row: the sum of nothing is 0.
const countOf = (how: string): unknown => ({
  $sum: {
    over: {
      $pluck: {
        over: { $filter: { over: { $ref: '$.result' }, as: 'row', when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['how'] } }, how] } } },
        key: 'runs',
      },
    },
  },
});

export const queriesTally: SeedEntry = {
  fingerprint: 'queries/tally',
  refresh: 'reactive',
  intent: 'How many queries were answered by replaying a stored query, by generating a new one, and refused',
  shape: [{ how: '', runs: 0 }],
  dsl: {
    from: ['queries'],
    fields: ['queries.how'],
    aggregate: { runs: { count: '*' } },
    groupBy: ['queries.how'],
    sort: [{ field: 'queries.how', dir: 'asc' }],
  },
  mapping: { replayed: countOf('replayed'), generated: countOf('generated'), refused: countOf('refused') },
};

// Record one query and how it was answered, as the caller — the engine stamps
// whose (behaviors.ts).
export const queryRecord: SeedMutation = {
  fingerprint: 'queries/record',
  intent: 'Record a query run from words and how it was answered',
  mutation: {
    op: 'insert',
    table: 'queries',
    values: {
      request: { $context: 'request' },
      shape: { $context: 'shape' },
      how: { $context: 'how' },
      fingerprint: { $context: 'fingerprint' },
    },
  },
};

export const QUERY_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [queriesKnown, queriesTally, queryRecord];
