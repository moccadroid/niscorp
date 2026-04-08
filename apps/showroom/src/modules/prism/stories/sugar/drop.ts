import type { PrismStory } from '../../story-types';

export const dropStory: PrismStory = {
  id: 'drop',
  name: '$drop',
  description:
    'Sugar: skip the first N elements of an array, keep the rest. Mirror of `$take`. Also desugars to `$slice` — just with `start` set instead of `end`.',
  category: 'Sugar',
  kind: 'transform',
  input: { numbers: [10, 20, 30, 40, 50, 60, 70, 80] },
  config: { $drop: { from: { $ref: '$.numbers' }, count: 3 } },
  expected: [40, 50, 60, 70, 80],
};
