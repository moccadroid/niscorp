import type { PrismStory } from '../../story-types';

export const constStory: PrismStory = {
  id: 'const',
  name: '$const',
  description:
    'Returns a literal JSON value unchanged. The simplest op — useful as a building block inside other expressions.',
  category: 'Operators',
  kind: 'transform',
  input: {},
  config: { $const: 42 },
  expected: 42,
};
