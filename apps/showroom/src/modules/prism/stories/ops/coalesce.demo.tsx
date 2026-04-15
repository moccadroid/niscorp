import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    user: { name: null, displayName: null, email: 'ada@example.com' },
  };

export const config = {
    $coalesce: [
      { $ref: '$.user.name' },
      { $ref: '$.user.displayName' },
      { $ref: '$.user.email' },
      { $const: '(no name available)' },
    ],
  };

export const Demo = () => <PrismView input={input} config={config} />;
