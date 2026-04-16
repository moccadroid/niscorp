import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { score: 87 };

export const config = {
    $case: {
      branches: [
        { when: { $gte: [{ $ref: '$.score' }, { $const: 90 }] }, then: { $const: 'A' } },
        { when: { $gte: [{ $ref: '$.score' }, { $const: 80 }] }, then: { $const: 'B' } },
        { when: { $gte: [{ $ref: '$.score' }, { $const: 70 }] }, then: { $const: 'C' } },
      ],
      else: { $const: 'F' },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
