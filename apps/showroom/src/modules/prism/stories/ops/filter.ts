import type { PrismStory } from '../../story-types';

export const filterStory: PrismStory = {
  id: 'filter',
  name: '$filter',
  description:
    'Keeps only the array elements where `when` evaluates truthy. Combine with predicate ops ($gt, $eq, $contains, etc.) to express the condition.',
  category: 'Operators',
  kind: 'transform',
  input: {
    items: [
      { name: 'Apple', price: 1.5 },
      { name: 'Banana', price: 0.5 },
      { name: 'Carrot', price: 2.0 },
      { name: 'Date', price: 3.0 },
    ],
  },
  config: {
    $filter: {
      over: { $ref: '$.items' },
      as: 'item',
      when: {
        $gte: [{ $get: { from: { $var: 'item' }, path: ['price'] } }, { $const: 1.5 }],
      },
    },
  },
  expected: [
    { name: 'Apple', price: 1.5 },
    { name: 'Carrot', price: 2.0 },
    { name: 'Date', price: 3.0 },
  ],
};
