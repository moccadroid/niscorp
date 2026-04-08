import type { PrismStory } from '../../story-types';

export const groupByStory: PrismStory = {
  id: 'group-by',
  name: 'Group by category',
  description:
    'Bucket an array of records by a computed key. $groupBy returns an object where each key holds the array of original records that share it.',
  category: 'Real world',
  kind: 'transform',
  input: {
    items: [
      { name: 'Apple', category: 'fruit' },
      { name: 'Banana', category: 'fruit' },
      { name: 'Carrot', category: 'vegetable' },
      { name: 'Date', category: 'fruit' },
      { name: 'Eggplant', category: 'vegetable' },
    ],
  },
  config: {
    $groupBy: {
      over: { $ref: '$.items' },
      as: 'item',
      key: { $get: { from: { $var: 'item' }, path: ['category'] } },
    },
  },
  expected: {
    fruit: [
      { name: 'Apple', category: 'fruit' },
      { name: 'Banana', category: 'fruit' },
      { name: 'Date', category: 'fruit' },
    ],
    vegetable: [
      { name: 'Carrot', category: 'vegetable' },
      { name: 'Eggplant', category: 'vegetable' },
    ],
  },
};
