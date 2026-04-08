import type { ActionStory } from '../../story-types';

export const listStory: ActionStory = {
  id: 'list',
  name: 'List add/remove',
  description:
    'Demonstrates the `push` data op feeding a `for` loop. The list iterates `$.items` and renders one Box per entry. Click "Add item" — a new entry is pushed onto the array, the loop re-evaluates, and a fresh Box appears at the end while the count text bumps up.',
  kind: 'action',
  category: 'Data',
  action: {
    id: 'list',
    data: {
      items: [{ name: 'Apple' }, { name: 'Banana' }, { name: 'Cherry' }],
    },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 12, padding: 24 },
      children: [
        {
          component: 'Text',
          props: { weight: 'bold' },
          children: 'Items: {{$.items.length}}',
        },
        {
          for: '$.items',
          as: 'item',
          do: {
            component: 'Box',
            props: { padding: 12, background: '#f1f5f9', radius: 6 },
            children: {
              component: 'Text',
              children: '{{$item.name}}',
            },
          },
        },
        { component: 'Button', ref: 'add', children: 'Add item' },
      ],
    },
    triggers: [
      {
        event: 'ui:click',
        ref: 'add',
        do: [{ push: 'items', value: { name: 'New item' } }],
      },
    ],
  },
  expected: {
    textIncludes: ['Items: 3', 'Apple', 'Banana', 'Cherry', 'Add item'],
  },
};
