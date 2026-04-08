import type { PrismStory } from '../../story-types';

export const takeStory: PrismStory = {
  id: 'take',
  name: '$take',
  description:
    'Sugar: take the first N elements of an array. Desugars to `$slice` from 0 to N. The **Compiled** tab confirms it\u2019s just a slice under the hood.',
  category: 'Sugar',
  kind: 'transform',
  input: { numbers: [10, 20, 30, 40, 50, 60, 70, 80] },
  config: { $take: { from: { $ref: '$.numbers' }, count: 3 } },
  expected: [10, 20, 30],
};
