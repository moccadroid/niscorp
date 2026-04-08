import type { PrismStory } from '../../story-types';

export const filterThenMapStory: PrismStory = {
  id: 'filter-then-map',
  name: 'Filter → map',
  description:
    'Compose ops by nesting them. Filter the array first, then map the survivors into a different shape. Each op produces a value the next op consumes.',
  category: 'Composition',
  kind: 'transform',
  input: {
    products: [
      { name: 'Apple', price: 1.5, inStock: true },
      { name: 'Banana', price: 0.5, inStock: false },
      { name: 'Carrot', price: 2.0, inStock: true },
      { name: 'Date', price: 3.0, inStock: false },
    ],
  },
  config: {
    $map: {
      over: {
        $filter: {
          over: { $ref: '$.products' },
          as: 'p',
          when: { $get: { from: { $var: 'p' }, path: ['inStock'] } },
        },
      },
      as: 'p',
      body: { $get: { from: { $var: 'p' }, path: ['name'] } },
    },
  },
  expected: ['Apple', 'Carrot'],
};
