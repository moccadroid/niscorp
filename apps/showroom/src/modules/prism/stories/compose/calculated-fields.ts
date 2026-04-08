import type { PrismStory } from '../../story-types';

export const calculatedFieldsStory: PrismStory = {
  id: 'calculated-fields',
  name: 'Calculated fields',
  description:
    'Build derived fields from raw input. Cart line items → subtotal, tax, total. Uses `$with` to bind the subtotal once and reuse it via `$var`, then `$round` to fix the precision.',
  category: 'Composition',
  kind: 'transform',
  input: {
    items: [
      { name: 'Widget', price: 9.99, qty: 3 },
      { name: 'Gadget', price: 19.5, qty: 2 },
      { name: 'Sprocket', price: 4.25, qty: 5 },
    ],
    taxRate: 0.08,
  },
  config: {
    $with: {
      let: {
        subtotal: {
          $sum: {
            over: {
              $map: {
                over: { $ref: '$.items' },
                as: 'item',
                body: {
                  $mul: [
                    { $get: { from: { $var: 'item' }, path: ['price'] } },
                    { $get: { from: { $var: 'item' }, path: ['qty'] } },
                  ],
                },
              },
            },
          },
        },
      },
      value: {
        subtotal: { $round: { value: { $var: 'subtotal' }, digits: 2 } },
        tax: {
          $round: {
            value: { $mul: [{ $var: 'subtotal' }, { $ref: '$.taxRate' }] },
            digits: 2,
          },
        },
        total: {
          $round: {
            value: {
              $add: [
                { $var: 'subtotal' },
                { $mul: [{ $var: 'subtotal' }, { $ref: '$.taxRate' }] },
              ],
            },
            digits: 2,
          },
        },
        itemCount: { $count: { over: { $ref: '$.items' } } },
      },
    },
  },
  expected: {
    subtotal: 90.22,
    tax: 7.22,
    total: 97.44,
    itemCount: 3,
  },
};
