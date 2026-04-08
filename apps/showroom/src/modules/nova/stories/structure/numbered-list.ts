import type { LayoutStory } from '../../story-types';

export const numberedListStory: LayoutStory = {
  id: 'structure-numbered-list',
  name: 'Numbered list',
  description:
    'Demonstrates the implicit `$index` scope variable inside a `for` loop. Each iteration combines `{{$index}}` with `{{$item.name}}` in a single Text, producing a zero-indexed numbered list straight from a flat data array.',
  kind: 'layout',
  category: 'Structure',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold', size: 'lg' },
        children: 'Numbered list',
      },
      {
        for: '$.items',
        as: 'item',
        do: {
          component: 'Box',
          props: { padding: 8, background: '#f1f5f9', radius: 4 },
          children: {
            component: 'Text',
            children: '{{$index}}. {{$item.name}}',
          },
        },
      },
    ],
  },
  data: {
    items: [{ name: 'Apple' }, { name: 'Banana' }, { name: 'Cherry' }, { name: 'Date' }],
  },
  expected: {
    textIncludes: ['Numbered list', '0. Apple', '1. Banana', '2. Cherry', '3. Date'],
  },
};
