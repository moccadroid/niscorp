import type { PrismStory } from '../../story-types';

export const avgStory: PrismStory = {
  id: 'avg',
  name: '$avg',
  description:
    'Sugar: arithmetic mean of an array. Desugars to `$div($sum, $count)` — two reductions over the same array. The **Compiled** tab shows the dual reduction; the **Stats** tab confirms the doubled node count.',
  category: 'Sugar',
  kind: 'transform',
  input: { scores: [80, 90, 100, 70] },
  config: { $avg: { over: { $ref: '$.scores' } } },
  expected: 85,
};
