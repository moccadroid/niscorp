import type { PrismStory } from '../../story-types';

export const pluckStory: PrismStory = {
  id: 'pluck',
  name: '$pluck',
  description:
    'Sugar: extract a single field from every element in an array. Desugars to `$map` whose body is a `$get` for the named key. Same result, less typing — open **Compiled** to see the expanded form.',
  category: 'Sugar',
  kind: 'transform',
  input: {
    users: [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Grace' },
      { id: 'u3', name: 'Linus' },
    ],
  },
  config: { $pluck: { over: { $ref: '$.users' }, key: 'name' } },
  expected: ['Ada', 'Grace', 'Linus'],
};
