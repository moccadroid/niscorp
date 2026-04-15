import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    items: [
      { name: 'Apple', price: 1.5 },
      { name: 'Banana', price: 0.5 },
      { name: 'Carrot', price: 2.0 },
      { name: 'Date', price: 3.0 },
    ],
  };

export const config = {
    $filter: {
      over: { $ref: '$.items' },
      as: 'item',
      when: {
        $gte: [{ $get: { from: { $var: 'item' }, path: ['price'] } }, { $const: 1.5 }],
      },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
