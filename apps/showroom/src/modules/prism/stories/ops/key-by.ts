import type { PrismStory } from '../../story-types';

export const keyByStory: PrismStory = {
  id: 'key-by',
  name: '$keyBy',
  description:
    'Indexes an array of records by a computed key, returning an object. Last record wins on collisions. The classic "turn an array into a lookup table" pattern.',
  category: 'Operators',
  kind: 'transform',
  input: {
    products: [
      { sku: 'A1', name: 'Apple', price: 1.5 },
      { sku: 'B1', name: 'Banana', price: 0.5 },
      { sku: 'C1', name: 'Cherry', price: 3.0 },
    ],
  },
  config: {
    $keyBy: {
      over: { $ref: '$.products' },
      as: 'p',
      key: { $get: { from: { $var: 'p' }, path: ['sku'] } },
    },
  },
  expected: {
    A1: { sku: 'A1', name: 'Apple', price: 1.5 },
    B1: { sku: 'B1', name: 'Banana', price: 0.5 },
    C1: { sku: 'C1', name: 'Cherry', price: 3.0 },
  },
};
