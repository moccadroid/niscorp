import type { ActionStory } from '../../story-types';

export const counterStory: ActionStory = {
  id: 'counter',
  name: 'Counter',
  description:
    'A minimal counter action with `count` in data. Click Increment or Decrement — the trigger fires the `increment`/`decrement` op on the `count` path, the data store updates, and the Text re-renders showing the new value.',
  kind: 'action',
  category: 'Basics',
  action: {
    id: 'counter',
    data: { count: 0 },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 16, padding: 24 },
      children: [
        {
          component: 'Text',
          props: { size: 'xl', weight: 'bold' },
          children: 'Count: {{$.count}}',
        },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 8 },
          children: [
            { component: 'Button', ref: 'inc', children: 'Increment' },
            {
              component: 'Button',
              ref: 'dec',
              props: { variant: 'secondary' },
              children: 'Decrement',
            },
          ],
        },
      ],
    },
    triggers: [
      { event: 'ui:click', ref: 'inc', do: [{ increment: 'count' }] },
      { event: 'ui:click', ref: 'dec', do: [{ decrement: 'count' }] },
    ],
  },
  expected: { textIncludes: ['Count: 0', 'Increment', 'Decrement'] },
};
