import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    items: [
      { name: 'Widget', price: 9.99, qty: 3 },
      { name: 'Gadget', price: 19.5, qty: 2 },
      { name: 'Sprocket', price: 4.25, qty: 5 },
    ],
    taxRate: 0.08,
  };

export const config = {
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
  };

export const Demo = () => <PrismView input={input} config={config} />;
