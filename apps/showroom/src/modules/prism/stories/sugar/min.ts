import type { PrismStory } from '../../story-types';

export const minStory: PrismStory = {
  id: 'min',
  name: '$min',
  description:
    'Sugar: smallest value in an array. Desugars to a `$reduce` whose body is a `$case` choosing the smaller of accumulator and current. Open **Compiled** to see how much the canonical form expands.',
  category: 'Sugar',
  kind: 'transform',
  input: { temps: [22, 18, 25, 14, 27, 19] },
  config: { $min: { over: { $ref: '$.temps' } } },
  expected: 14,
};
