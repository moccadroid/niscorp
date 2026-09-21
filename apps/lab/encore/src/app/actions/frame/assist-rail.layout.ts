import type { LayoutNode } from '@niscorp/nova';

// A QUIET HISTORY IS ONE LINE: "Earlier · 3". Pressed, it opens to the last few
// turns, a line each, and "show all"; pressed again it shuts. Who answered — the
// cards, the assistant, an event — is not an operator's business: the rows are
// projected, so the role is not even sent.
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
          // The only thing that ever ends a thread, and it is a person's click.
          { if: '$.expanded', then: { component: 'Button', ref: 'newThread', props: { label: 'new thread', variant: 'quiet' } }, else: '' },
        ],
      },
      { if: '$.expanded', then: rail, else: '' },
    ],
  },
  else: '',
};
