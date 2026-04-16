import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
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
    $pick: { from: { $ref: '$.user' }, keys: ['id', 'name', 'email', 'createdAt'] },
  };

export const Demo = () => <PrismView input={input} config={config} />;
