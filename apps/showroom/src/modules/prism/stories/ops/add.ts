import type { PrismStory } from '../../story-types';

export const addStory: PrismStory = {
  id: 'add',
  name: '$add',
  description:
    'Adds two numeric operands. The four binary math ops ($add, $sub, $mul, $div) all take a fixed two-element tuple. Operands can be any expression, not just literals.',
  category: 'Operators',
  kind: 'transform',
  input: { price: 99, tax: 8 },
  config: { $add: [{ $ref: '$.price' }, { $ref: '$.tax' }] },
  expected: 107,
};
