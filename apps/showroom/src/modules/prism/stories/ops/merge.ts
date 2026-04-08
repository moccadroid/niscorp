import type { PrismStory } from '../../story-types';

export const mergeStory: PrismStory = {
  id: 'merge',
  name: '$merge',
  description:
    'Shallow merges multiple objects left to right. Later objects overwrite earlier ones — useful for "default options + user overrides" patterns.',
  category: 'Operators',
  kind: 'transform',
  input: {
    defaults: { theme: 'light', fontSize: 14, autoSave: true },
    overrides: { theme: 'dark', fontSize: 16 },
  },
  config: {
    $merge: [{ $ref: '$.defaults' }, { $ref: '$.overrides' }],
  },
  expected: { theme: 'dark', fontSize: 16, autoSave: true },
};
