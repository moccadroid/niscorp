import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the ask ──
//
// A question put to the records is answered by a fingerprint: an earlier
// question's stored query, replayed, or a new one the model writes under the
// asker's own policy. These rows remember which — the router reads them to
// know what has been asked before, and the projector counts them.

// What the router may send a new question to: every question that was
// answered by a query of its own, newest first. Read as the asker.
export const asksKnown: SeedEntry = {
  fingerprint: 'asks/known',
  intent: 'Questions answered by a query of their own, with the fingerprint and shape they replay by, newest first',
  shape: [{ question: '', fingerprint: '', shape: '' }],
  dsl: {
    from: ['asks'],
    fields: ['asks.question', 'asks.fingerprint', 'asks.shape'],
    filter: { eq: ['asks.how', 'generated'] },
    sort: [{ field: 'asks.asked_at', dir: 'desc' }],
    limit: 200,
  },
};

// How many questions were answered each way — the projector's tally. Counts
// only: the words were written by people and do not go up on the wall. A way
// nobody has been answered yet has no row: the sum of nothing is 0.
const countOf = (how: string): unknown => ({
  $sum: {
    over: {
      $pluck: {
        over: { $filter: { over: { $ref: '$.result' }, as: 'row', when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['how'] } }, how] } } },
        key: 'asked',
      },
    },
  },
});

export const asksTally: SeedEntry = {
  fingerprint: 'asks/tally',
  refresh: 'reactive',
  intent: 'How many questions were answered by replaying a stored query, by generating a new one, and refused',
  shape: [{ how: '', asked: 0 }],
  dsl: {
    from: ['asks'],
    fields: ['asks.how'],
    aggregate: { asked: { count: '*' } },
    groupBy: ['asks.how'],
    sort: [{ field: 'asks.how', dir: 'asc' }],
  },
  mapping: { replayed: countOf('replayed'), generated: countOf('generated'), refused: countOf('refused') },
};

// Write down one question and how it was answered, as the asker — the engine
// stamps whose (behaviors.ts).
export const askRecord: SeedMutation = {
  fingerprint: 'asks/record',
  intent: 'Record a question put to the records and how it was answered',
  mutation: {
    op: 'insert',
    table: 'asks',
    values: {
      question: { $context: 'question' },
      shape: { $context: 'shape' },
      how: { $context: 'how' },
      fingerprint: { $context: 'fingerprint' },
    },
  },
};

export const ASK_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [asksKnown, asksTally, askRecord];
