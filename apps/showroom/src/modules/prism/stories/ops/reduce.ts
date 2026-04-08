import type { PrismStory } from '../../story-types';

export const reduceStory: PrismStory = {
  id: 'reduce',
  name: '$reduce',
  description:
    'Folds an array into a single value via an accumulator. Both the current element and the accumulator are in scope inside `body`. Default accumulator name is "acc".',
  category: 'Operators',
  kind: 'transform',
  input: { numbers: [3, 1, 4, 1, 5, 9, 2, 6] },
  config: {
    $reduce: {
      over: { $ref: '$.numbers' },
      as: 'n',
      acc: 'total',
      init: { $const: 0 },
      body: { $add: [{ $var: 'total' }, { $var: 'n' }] },
    },
  },
  expected: 31,
};
