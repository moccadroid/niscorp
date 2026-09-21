import type { LayoutNode } from '@niscorp/nova';

export const roomMarkerLayout: LayoutNode = {
  if: '$.xray',
  then: {
    component: 'Box',
    props: { tone: 'marker', px: 12, py: 6 },
    children: [
      {
        component: 'Row',
        props: { gap: 10, align: 'center', justify: 'between' },
        children: [
          { component: 'Text', props: { value: 'X-ray — instruments visible. This is how the room decided, not what an operator sees.', variant: 'label' } },
          { component: 'Button', ref: 'off', props: { label: 'turn off', variant: 'ghost' } },
        ],
      },
    ],
  },
  else: '',
};
