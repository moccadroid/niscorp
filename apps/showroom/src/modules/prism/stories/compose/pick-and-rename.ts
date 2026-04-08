import type { PrismStory } from '../../story-types';

export const pickAndRenameStory: PrismStory = {
  id: 'pick-and-rename',
  name: 'Pick + rename',
  description:
    'Build a smaller object from a larger one. A plain object literal in a prism config is treated as a template — each value is itself an expression. Combine with $ref to pull fields and rename them.',
  category: 'Composition',
  kind: 'transform',
  input: {
    raw: {
      user_id: 'u_42',
      first_name: 'Ada',
      last_name: 'Lovelace',
      created_at: '2024-01-01',
      internal_token: 'sekret',
      legacy_field: 'ignored',
    },
  },
  config: {
    id: { $ref: '$.raw.user_id' },
    firstName: { $ref: '$.raw.first_name' },
    lastName: { $ref: '$.raw.last_name' },
    createdAt: { $ref: '$.raw.created_at' },
  },
  expected: {
    id: 'u_42',
    firstName: 'Ada',
    lastName: 'Lovelace',
    createdAt: '2024-01-01',
  },
};
