import type { SeedEntry, SeedMutation } from '@niscorp/vex';

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

// A way nothing has been answered yet has no row: the sum of nothing is 0.
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
