import type { LayoutNode } from '@niscorp/nova';

// A VEX QUERY'S RESULT, shown by the shape it came in (vex/query.shapes.ts) —
// in the query the assistant opens (actions/query/). The route hands back
// only WHICH shape and HOW it was reached; what each looks like is written
// here, one branch per kind, picked by `$eq`. A kind with no branch below falls
// through to the list's columns; query-check holds every kind to a branch.
//
// `at` names where the three live in the action's data: the kind, how it was
// answered, the rows (and, for one number, their `value`).
export type AnswerAt = { kind: string; how: string; rows: string };

const rows = (at: AnswerAt, columns: { label: string; key: string; w: number; kind?: 'mono' }[]): LayoutNode => ({
  component: 'Rows',
  props: { rows: at.rows, columns, empty: 'Nothing on record.' },
});

const LIST_COLUMNS = [
  { label: 'Answer', key: 'label', w: 1 },
  { label: '', key: 'detail', w: 2 },
];

export const answerLayout = (at: AnswerAt): LayoutNode[] => [
  {
    if: { $eq: [at.kind, 'number'] },
    then: { component: 'Figure', props: { label: 'Result', value: `${at.rows}.value` } },
    else: {
      if: { $eq: [at.kind, 'counts'] },
      then: rows(at, [
        { label: 'Group', key: 'group', w: 2 },
        { label: 'How many', key: 'count', w: 1, kind: 'mono' },
      ]),
      else: {
        if: { $eq: [at.kind, 'people'] },
        then: rows(at, [
          { label: 'Name', key: 'name', w: 2 },
          { label: 'Title', key: 'title', w: 2 },
        ]),
        else: {
          if: { $eq: [at.kind, 'list'] },
          then: rows(at, LIST_COLUMNS),
          // A kind nobody wrote a branch for: its rows, as a list shows them.
          else: rows(at, LIST_COLUMNS),
        },
      },
    },
  },
  // How it was reached — the point of the query.
  {
    if: { $eq: [at.how, 'replayed'] },
    then: { component: 'Text', props: { tone: 'muted' }, children: 'Replayed: this query was on record from an earlier request. No model wrote anything.' },
    else: {
      component: 'Text',
      props: { tone: 'muted' },
      children: 'Generated: no query on record fitted, so a model wrote this one just now, under your clearance. It is stored — the next request like it replays it.',
    },
  },
];
