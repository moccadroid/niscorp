import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {};

export const config = {
    $with: {
      let: { a: { $const: 10 }, b: { $const: 32 } },
      value: { $add: [{ $var: 'a' }, { $var: 'b' }] },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
