import type { PrismStory } from '../../story-types';

export const refStory: PrismStory = {
  id: 'ref',
  name: '$ref',
  description:
    'Reads a value from the source data by JSONPath. Paths must start with `$.` and address fields by name or array index.',
  category: 'Operators',
  kind: 'transform',
  input: {
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    items: [{ sku: 'A1' }, { sku: 'A2' }, { sku: 'A3' }],
  },
  config: { $ref: '$.user.name' },
  expected: 'Ada Lovelace',
};
