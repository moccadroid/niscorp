import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    items: [
      { name: 'Apple', category: 'fruit' },
      { name: 'Banana', category: 'fruit' },
      { name: 'Carrot', category: 'vegetable' },
      { name: 'Date', category: 'fruit' },
      { name: 'Eggplant', category: 'vegetable' },
    ],
  };

export const config = {
    $groupBy: {
      over: { $ref: '$.items' },
      as: 'item',
      key: { $get: { from: { $var: 'item' }, path: ['category'] } },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
