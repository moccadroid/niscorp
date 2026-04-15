import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { numbers: [1, 2, 3, 4, 5] };

export const config = {
    $map: {
      over: { $ref: '$.numbers' },
      as: 'n',
      body: { $mul: [{ $var: 'n' }, { $const: 2 }] },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
