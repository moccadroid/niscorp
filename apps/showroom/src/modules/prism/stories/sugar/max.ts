import type { PrismStory } from '../../story-types';

export const maxStory: PrismStory = {
  id: 'max',
  name: '$max',
  description:
    'Sugar: largest value in an array. Mirror image of `$min` — same `$reduce + $case` structure but the comparison flips to `$gt`. The **Compiled** tab makes the symmetry explicit.',
  category: 'Sugar',
  kind: 'transform',
  input: { scores: [42, 67, 89, 33, 95, 78] },
  config: { $max: { over: { $ref: '$.scores' } } },
  expected: 95,
};
