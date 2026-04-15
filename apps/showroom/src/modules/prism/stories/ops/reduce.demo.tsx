import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { numbers: [3, 1, 4, 1, 5, 9, 2, 6] };

export const config = {
    $reduce: {
      over: { $ref: '$.numbers' },
      as: 'n',
      acc: 'total',
      init: { $const: 0 },
      body: { $add: [{ $var: 'total' }, { $var: 'n' }] },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
