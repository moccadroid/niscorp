import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice } from './panel';

export const runsLayout: LayoutNode = panel(
  'Agent runs',
  'Every model run — what went out, what it called, what came back, and what it cost',
  split(
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        errorNotice,
        {
          component: 'Grid',
          props: { min: 110, gap: 10 },
          children: [
            { component: 'Stat', props: { label: 'Runs', value: '$.runs.figures.runs' } },
            { component: 'Stat', props: { label: 'Tokens', value: '$.runs.figures.total' } },
            { component: 'Stat', props: { label: 'In / out', value: '$.runs.figures.split' } },
            { component: 'Stat', props: { label: 'Average', value: '$.runs.figures.pace' } },
          ],
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'By agent' },
        {
          component: 'Rows',
          props: {
            rows: '$.runs.byAgent',
            rowKey: 'id',
            dense: true,
            empty: 'Nothing recorded yet.',
            columns: [
              { label: 'Agent', w: 2, cell: { kind: 'primary', key: 'agent', subKey: 'detail' } },
              { label: 'Tokens', w: 'auto', cell: { kind: 'text', key: 'total' } },
            ],
          },
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'By person' },
        {
          component: 'Rows',
          props: {
            rows: '$.runs.byPerson',
            rowKey: 'id',
            dense: true,
            empty: 'Nothing recorded yet.',
            columns: [
              { label: 'Who', w: 2, cell: { kind: 'primary', key: 'who', subKey: 'detail' } },
              { label: 'Tokens', w: 'auto', cell: { kind: 'text', key: 'total' } },
            ],
          },
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'By model' },
        {
          component: 'Rows',
          props: {
            rows: '$.runs.byModel',
            rowKey: 'id',
            dense: true,
            empty: 'Nothing recorded yet.',
            columns: [
              { label: 'Model', w: 2, cell: { kind: 'primary', key: 'model', subKey: 'detail' } },
              { label: 'Tokens', w: 'auto', cell: { kind: 'text', key: 'total' } },
            ],
          },
        },
        {
          component: 'Box',
          props: { px: 12, py: 10, bg: 'sunk', radius: 10 },
          children: {
            component: 'Text',
            props: { size: 'xs', color: 'faint' },
            children:
              'Counted by the provider and reported by cortex, not estimated here; a ~ marks a run signal had to count itself. A failed run is recorded too — it spent tokens. No prices: model rates move, tokens do not.',
          },
        },
      ],
    },

    {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        { component: 'Text', props: { serif: true, size: 'lg' }, children: 'Every run, newest first' },
        {
          component: 'Rows',
          props: {
            rows: '$.runs.runs',
            rowKey: 'id',
            rowRef: 'open',
            loading: '$.loading',
            empty: 'No runs recorded. Ask the assistant something, or let it watch a screen.',
            columns: [
              { label: 'Who', w: 1, cell: { kind: 'primary', key: 'who', subKey: 'when' } },
              { label: 'Started by', w: 'auto', cell: { kind: 'chip', key: 'label', toneKey: 'label_tone' } },
              { label: 'Model', w: 1, cell: { kind: 'text', key: 'model' } },
              { label: 'Called', w: 1, cell: { kind: 'text', key: 'called' } },
              { label: 'Tokens', w: 'auto', cell: { kind: 'text', key: 'tokens' } },
              { label: '', w: 'auto', cell: { kind: 'chip', key: 'outcome', toneKey: 'outcome_tone' } },
              { label: 'Took', w: 'auto', cell: { kind: 'text', key: 'took' } },
            ],
          },
        },

        {
          if: '$.open.id',
          then: {
            component: 'Stack',
            props: { gap: 10 },
            children: [
              { component: 'Rule', props: {} },
              {
                component: 'Row',
                props: { justify: 'between', align: 'center' },
                children: [
                  { component: 'Text', props: { serif: true, size: 'lg' }, children: 'The whole exchange' },
                  { component: 'Button', ref: 'close', props: { variant: 'plain' }, children: 'Close' },
                ],
              },
              {
                component: 'Text',
                props: { size: 'xs', color: 'faint' },
                children: '{{$.open.who}} · {{$.open.agent}} · {{$.open.label}} · {{$.open.model}} · {{$.open.tokens}} tokens · {{$.open.took}}',
              },
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'ANSWERED' },
              { component: 'Code', props: { text: '$.open.response', max: 200 } },

              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'PROMPT' },
              { component: 'Code', props: { text: '$.open.prompt', max: 620 } },

              {
                if: '$.open.calls',
                then: {
                  component: 'Stack',
                  props: { gap: 8 },
                  children: [
                    { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'TOOL CALLS' },
                    {
                      component: 'Stack',
                      props: { gap: 10 },
                      children: {
                        for: '$.open.calls',
                        as: 'call',
                        key: 'id',
                        do: {
                          component: 'Stack',
                          props: { gap: 4 },
                          children: [
                            { component: 'Badge', props: { tone: 'accent' }, children: '$call.name' },
                            { component: 'Code', props: { text: '$call.args', max: 140 } },
                            { component: 'Code', props: { text: '$call.result', max: 200 } },
                          ],
                        },
                      },
                    },
                  ],
                },
                else: '',
              },
            ],
          },
          else: '',
        },
      ],
    },
  ),
);
