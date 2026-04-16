import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    items: [{ sku: 'A1' }, { sku: 'A2' }, { sku: 'A3' }],
  };

export const config = { $ref: '$.user.name' };

export const Demo = () => <PrismView input={input} config={config} />;
