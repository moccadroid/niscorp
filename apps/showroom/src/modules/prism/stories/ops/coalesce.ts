import type { PrismStory } from '../../story-types';

export const coalesceStory: PrismStory = {
  id: 'coalesce',
  name: '$coalesce',
  description:
    'Tries each value in order and returns the first one that is not null/undefined. The classic "fallback chain" — preferred → backup → default.',
  category: 'Operators',
  kind: 'transform',
  input: {
    user: { name: null, displayName: null, email: 'ada@example.com' },
  },
  config: {
    $coalesce: [
      { $ref: '$.user.name' },
      { $ref: '$.user.displayName' },
      { $ref: '$.user.email' },
      { $const: '(no name available)' },
    ],
  },
  expected: 'ada@example.com',
};
