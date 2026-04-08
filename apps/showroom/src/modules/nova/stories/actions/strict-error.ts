import type { ActionStory } from '../../story-types';

export const strictErrorStory: ActionStory = {
  id: 'strict-error',
  name: 'Strict mode error',
  description:
    'Demonstrates lax-mode error handling. The layout references a `Nonexistent` component that is not in the registry. The renderer emits an error RenderNode in place of the missing component, while the surrounding Stack and Text still render normally — nothing crashes.',
  kind: 'action',
  category: 'Errors',
  action: {
    id: 'strict-error',
    data: {},
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 12, padding: 24 },
      children: [
        {
          component: 'Text',
          children: 'About to reference an unknown component:',
        },
        { component: 'Nonexistent' },
      ],
    },
  },
  expected: {
    textIncludes: ['About to reference an unknown component'],
  },
};
