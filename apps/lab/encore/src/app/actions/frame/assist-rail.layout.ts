import type { LayoutNode } from '@niscorp/nova';

const SHOWN = 3;

const rail: LayoutNode = {
  component: 'Rail',
  ref: 'entry',
  props: {
    rows: { $prism: { $map: { over: { $ref: '$.entries' }, as: 'row', body: { $omit: { from: { $var: 'row' }, keys: ['by'] } } } } },
    rowKey: 'key',
    toneKey: 'tone',
    primaryKey: 'line',
    secondaryKey: 'said',
    detailKey: 'full',
    open: '$.open',
    max: { $if: { $eq: ['$.open', '__all__'] }, $then: 999, $else: SHOWN },
  },
};

export const assistRailLayout: LayoutNode = {
  if: '$.entries.length',
  then: {
    component: 'Stack',
    props: { gap: 2 },
    children: [
      {
        component: 'Row',
        props: { gap: 12, align: 'center' },
        children: [
          { if: '$.expanded', then: { component: 'Button', ref: 'earlierShut', props: { label: 'Earlier ▾', variant: 'quiet' } }, else: { component: 'Button', ref: 'earlierOpen', props: { label: 'Earlier · {{$.entries.length}}', variant: 'quiet' } } },
          { if: '$.expanded', then: { component: 'Button', ref: 'newThread', props: { label: 'new thread', variant: 'quiet' } }, else: '' },
        ],
      },
      { if: '$.expanded', then: rail, else: '' },
    ],
  },
  else: '',
};
