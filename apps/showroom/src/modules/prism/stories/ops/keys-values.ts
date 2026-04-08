import type { PrismStory } from '../../story-types';

export const keysValuesStory: PrismStory = {
  id: 'keys-values',
  name: '$keys / $values',
  description:
    'Decompose an object into its keys or values arrays. Useful when you want to count fields, iterate, or feed the keys into another op.',
  category: 'Operators',
  kind: 'transform',
  input: {
    settings: { theme: 'dark', fontSize: 16, autoSave: true, notifications: false },
  },
  config: {
    fieldNames: { $keys: { $ref: '$.settings' } },
    fieldValues: { $values: { $ref: '$.settings' } },
    fieldCount: { $length: { $keys: { $ref: '$.settings' } } },
  },
  expected: {
    fieldNames: ['theme', 'fontSize', 'autoSave', 'notifications'],
    fieldValues: ['dark', 16, true, false],
    fieldCount: 4,
  },
};
