import type { PrismStory } from '../../story-types';

export const pickStory: PrismStory = {
  id: 'pick',
  name: '$pick',
  description:
    'Keep only specific keys from an object, dropping the rest. Useful for stripping internal fields before sending data to a client.',
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
    $pick: { from: { $ref: '$.user' }, keys: ['id', 'name', 'email', 'createdAt'] },
  },
  expected: {
    id: 'u_42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: '2024-01-01',
  },
};
