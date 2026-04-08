import type { PrismStory } from '../../story-types';

export const mapStory: PrismStory = {
  id: 'map',
  name: '$map',
  description:
    'Transforms each element of an array. The current element is bound to a variable named by `as`; the `body` expression runs once per element with that variable in scope.',
  category: 'Operators',
  kind: 'transform',
  input: { numbers: [1, 2, 3, 4, 5] },
  config: {
    $map: {
      over: { $ref: '$.numbers' },
      as: 'n',
      body: { $mul: [{ $var: 'n' }, { $const: 2 }] },
    },
  },
  expected: [2, 4, 6, 8, 10],
};
