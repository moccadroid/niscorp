import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { user: { first: 'Ada', last: 'Lovelace' }, count: 3 };

export const config = {
    $interpolate: {
      template: 'Welcome, {{first}} {{last}}! You have {{count}} new messages.',
      values: {
        first: { $ref: '$.user.first' },
        last: { $ref: '$.user.last' },
        count: { $ref: '$.count' },
      },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
