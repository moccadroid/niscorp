import type { PrismStory } from '../../story-types';

export const sumStory: PrismStory = {
  id: 'sum',
  name: '$sum',
  description:
    'Sugar: sum every number in an array. Click the **Compiled** tab to see what `$sum` desugars to — a `$reduce` over the array with a `$add` accumulator. The Stats tab shows the node count jump.',
  category: 'Sugar',
  kind: 'transform',
  input: { values: [10, 20, 30, 40] },
  config: { $sum: { over: { $ref: '$.values' } } },
  expected: 100,
};
