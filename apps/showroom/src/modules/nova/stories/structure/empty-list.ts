import type { LayoutStory } from '../../story-types';

export const emptyListStory: LayoutStory = {
  id: 'structure-empty-list',
  name: 'Empty list',
  description:
    'Demonstrates the empty-collection pattern: an `if` on `$.items.length` wraps a `for` loop in its `then` branch and a placeholder Text in its `else` branch. With an empty array the user sees a gray "No items yet." message instead of a blank space.',
  kind: 'layout',
  category: 'Structure',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold', size: 'lg' },
        children: 'Items',
      },
      {
        if: '$.items.length',
        then: {
          for: '$.items',
          as: 'item',
          do: { component: 'Text', children: '{{$item.name}}' },
        },
        else: {
          component: 'Text',
          props: { color: '#9ca3af' },
          children: 'No items yet.',
        },
      },
    ],
  },
  data: { items: [] },
  expected: { textIncludes: ['Items', 'No items yet.'] },
};
