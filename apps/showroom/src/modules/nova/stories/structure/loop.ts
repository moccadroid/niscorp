import type { LayoutStory } from '../../story-types';

export const structureLoopStory: LayoutStory = {
  id: 'structure-loop',
  name: 'Loop',
  description:
    'Demonstrates the `for`/`as`/`do` loop node. The renderer iterates `$.users`, binds each entry to `$user`, and emits one Box+Text per item — producing four name cards from a four-element data array.',
  kind: 'layout',
  category: 'Structure',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      {
        for: '$.users',
        as: 'user',
        do: {
          component: 'Box',
          props: { padding: 12, background: '#f1f5f9', radius: 6 },
          children: { component: 'Text', children: '{{$user.name}}' },
        },
      },
    ],
  },
  data: {
    users: [
      { name: 'Ada' },
      { name: 'Grace' },
      { name: 'Linus' },
      { name: 'Margaret' },
    ],
  },
  expected: {
    textIncludes: ['Ada', 'Grace', 'Linus', 'Margaret'],
    componentCount: 9,
  },
};
