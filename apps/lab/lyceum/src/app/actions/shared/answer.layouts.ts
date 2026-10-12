import type { LayoutNode } from '@niscorp/nova';

export type AnswerAt = { kind: string; how: string; rows: string };

const rows = (at: AnswerAt, columns: { label: string; key: string; w: number; kind?: 'mono' }[]): LayoutNode => ({
  component: 'Rows',
  props: { rows: at.rows, columns, empty: 'No results.' },
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
          { label: 'Name', key: 'name', w: 1 },
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
  {
    if: { $eq: [at.how, 'replayed'] },
    then: { component: 'Text', props: { tone: 'muted' }, children: 'Replayed: an earlier request stored this query. No model wrote anything.' },
    else: {
      component: 'Text',
      props: { tone: 'muted' },
      children: 'Generated: no stored query fitted, so a model wrote this one now, under your permissions. It is stored; the next request like it replays it.',
    },
  },
];
