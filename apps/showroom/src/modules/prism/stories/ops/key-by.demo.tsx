import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    products: [
      { sku: 'A1', name: 'Apple', price: 1.5 },
      { sku: 'B1', name: 'Banana', price: 0.5 },
      { sku: 'C1', name: 'Cherry', price: 3.0 },
    ],
  };

export const config = {
    $keyBy: {
      over: { $ref: '$.products' },
      as: 'p',
      key: { $get: { from: { $var: 'p' }, path: ['sku'] } },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
