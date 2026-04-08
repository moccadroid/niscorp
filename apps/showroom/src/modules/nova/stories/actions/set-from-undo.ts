import type { ActionStory } from '../../story-types';

export const setFromUndoStory: ActionStory = {
  id: 'set-from-undo',
  name: 'Set { from } undo',
  description:
    'A counter with a one-step undo. Each increment first copies `current` into `previous` '
    + 'using `{ set, from }`, then bumps `current`. Clicking Undo restores `current` from '
    + '`previous`.',
  kind: 'action',
  category: 'Basics',
  action: {
    id: 'set-from-undo',
    data: { current: 0, previous: 0 },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 16, padding: 24 },
      children: [
        {
          component: 'Text',
          props: { size: 'xl', weight: 'bold' },
          children: 'Counter with undo',
        },
        { component: 'Text', children: 'Current: {{$.current}}' },
        { component: 'Text', children: 'Previous: {{$.previous}}' },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 8 },
          children: [
            { component: 'Button', ref: 'inc', children: 'Increment' },
            {
              component: 'Button',
              ref: 'undo',
              props: { variant: 'secondary' },
              children: 'Undo',
            },
          ],
        },
      ],
    },
    triggers: [
      {
        event: 'ui:click',
        ref: 'inc',
        do: [
          { set: 'previous', from: 'current' },
          { increment: 'current' },
        ],
      },
      {
        event: 'ui:click',
        ref: 'undo',
        do: [{ set: 'current', from: 'previous' }],
      },
    ],
  },
  expected: {
    textIncludes: ['Counter with undo', 'Current: 0', 'Previous: 0', 'Increment', 'Undo'],
  },
};
