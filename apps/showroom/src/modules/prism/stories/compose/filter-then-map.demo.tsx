import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    products: [
      { name: 'Apple', price: 1.5, inStock: true },
      { name: 'Banana', price: 0.5, inStock: false },
      { name: 'Carrot', price: 2.0, inStock: true },
      { name: 'Date', price: 3.0, inStock: false },
    ],
  };

export const config = {
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
  };

export const Demo = () => <PrismView input={input} config={config} />;
