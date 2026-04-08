import type { LayoutStory } from '../../story-types';

export const stackStory: LayoutStory = {
  id: 'stack',
  name: 'Stack',
  description:
    'Demonstrates the Stack flex primitive: `direction: row`, `gap`, `padding`, and `align: center`. Three colored Boxes sit side-by-side, separated by a 16px gap and inset by 24px from the edges — the simplest possible horizontal layout.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'row', gap: 16, padding: 24, align: 'center' },
    children: [
      {
        component: 'Box',
        props: { padding: 16, background: '#dbeafe', radius: 8 },
        children: { component: 'Text', props: { weight: 'bold' }, children: 'One' },
      },
      {
        component: 'Box',
        props: { padding: 16, background: '#fef3c7', radius: 8 },
        children: { component: 'Text', props: { weight: 'bold' }, children: 'Two' },
      },
      {
        component: 'Box',
        props: { padding: 16, background: '#dcfce7', radius: 8 },
        children: { component: 'Text', props: { weight: 'bold' }, children: 'Three' },
      },
    ],
  },
  data: {},
  expected: {
    componentCount: 7,
    textNodeCount: 3,
    textIncludes: ['One', 'Two', 'Three'],
  },
};
