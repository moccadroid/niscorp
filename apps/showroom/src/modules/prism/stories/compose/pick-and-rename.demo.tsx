import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
    raw: {
      user_id: 'u_42',
      first_name: 'Ada',
      last_name: 'Lovelace',
      created_at: '2024-01-01',
      internal_token: 'sekret',
      legacy_field: 'ignored',
    },
  };

export const config = {
    id: { $ref: '$.raw.user_id' },
    firstName: { $ref: '$.raw.first_name' },
    lastName: { $ref: '$.raw.last_name' },
    createdAt: { $ref: '$.raw.created_at' },
  };

export const Demo = () => <PrismView input={input} config={config} />;
