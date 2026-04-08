import type { PrismStory } from '../../story-types';

export const withStory: PrismStory = {
  id: 'with',
  name: '$with',
  description:
    'Binds local variables in a scoped block. Variables are read inside the block via $var. Useful for naming intermediate values and avoiding repetition.',
  category: 'Operators',
  kind: 'transform',
  input: {},
  config: {
    $with: {
      let: { a: { $const: 10 }, b: { $const: 32 } },
      value: { $add: [{ $var: 'a' }, { $var: 'b' }] },
    },
  },
  expected: 42,
};
