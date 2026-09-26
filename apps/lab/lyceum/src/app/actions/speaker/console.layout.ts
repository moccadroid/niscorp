import type { LayoutNode } from '@niscorp/nova';

export const consoleLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12, p: 24 },
  children: [
    { component: 'Text', props: { as: 'h2' }, children: 'Controller' },
    { component: 'Text', children: 'Slide {{$.current.number}} / {{$.count.slides}} — {{$.current.title}}' },
    {
      component: 'Row',
      props: { gap: 8 },
      children: [
        { component: 'Button', ref: 'back', children: 'Back' },
        { component: 'Button', ref: 'next', children: 'Next' },
      ],
    },
    { component: 'Text', children: '{{$.counts.joined}} joined · {{$.counts.sorted}} sorted' },
    {
      if: '$.sorting',
      then: { component: 'Text', children: 'Sorting…' },
      else: {
        component: 'Row',
        props: { gap: 8 },
        children: [
          { component: 'Button', ref: 'sort', children: 'Sort the room' },
          { component: 'Button', ref: 'unsort', children: 'Unsort the room (testing)' },
        ],
      },
    },
    { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
  ],
};
