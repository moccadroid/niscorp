import type { PrismStory } from '../../story-types';

export const omitStory: PrismStory = {
  id: 'omit',
  name: '$omit',
  description:
    'The inverse of `$pick` — drop specific keys, keep everything else. Cleaner when you want to remove a small set of sensitive fields without listing every safe one.',
  category: 'Operators',
  kind: 'transform',
  input: {
    user: {
      id: 'u_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      passwordHash: 'sekret-do-not-share',
      sessionToken: 'also-sekret',
      createdAt: '2024-01-01',
    },
  },
  config: {
    $omit: { from: { $ref: '$.user' }, keys: ['passwordHash', 'sessionToken'] },
  },
  expected: {
    id: 'u_42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: '2024-01-01',
  },
};
