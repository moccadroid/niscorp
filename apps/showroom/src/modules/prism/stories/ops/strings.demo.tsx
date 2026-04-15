import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { raw: '  Ada Lovelace  ', csv: 'apple,banana,cherry,date' };

export const config = {
    cleaned: { $trim: { $ref: '$.raw' } },
    upper: { $upper: { $trim: { $ref: '$.raw' } } },
    lower: { $lower: { $trim: { $ref: '$.raw' } } },
    fruits: { $split: { value: { $ref: '$.csv' }, sep: ',' } },
    fruitCount: { $length: { $split: { value: { $ref: '$.csv' }, sep: ',' } } },
    censored: {
      $replace: {
        value: { $ref: '$.csv' },
        search: 'banana',
        replacement: '***',
      },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
