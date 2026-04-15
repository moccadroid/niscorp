import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    defaults: { theme: 'light', fontSize: 14, autoSave: true },
    overrides: { theme: 'dark', fontSize: 16 },
  };

export const config = {
    $merge: [{ $ref: '$.defaults' }, { $ref: '$.overrides' }],
  };

export const Demo = () => <PrismView input={input} config={config} />;
