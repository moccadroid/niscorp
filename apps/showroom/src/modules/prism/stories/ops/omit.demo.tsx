import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    user: {
      id: 'u_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      passwordHash: 'sekret-do-not-share',
      sessionToken: 'also-sekret',
      createdAt: '2024-01-01',
    },
  };

export const config = {
    $omit: { from: { $ref: '$.user' }, keys: ['passwordHash', 'sessionToken'] },
  };

export const Demo = () => <PrismView input={input} config={config} />;
