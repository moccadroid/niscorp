import type { PrismStory } from '../../story-types';

export const countStory: PrismStory = {
  id: 'count',
  name: '$count',
  description:
    'Sugar: count the elements of an array. Desugars to a `$reduce` that adds 1 per element. Open the **Compiled** tab to see the canonical form.',
  category: 'Sugar',
  kind: 'transform',
  input: { items: ['apple', 'banana', 'cherry', 'date', 'elderberry'] },
  config: { $count: { over: { $ref: '$.items' } } },
  expected: 5,
};
