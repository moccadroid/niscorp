import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    users: [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Grace' },
      { id: 'u3', name: 'Linus' },
    ],
  };

export const config = { $pluck: { over: { $ref: '$.users' }, key: 'name' } };

export const Demo = () => <PrismView input={input} config={config} />;
