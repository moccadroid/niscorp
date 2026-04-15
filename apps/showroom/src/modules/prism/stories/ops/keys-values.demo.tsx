import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    settings: { theme: 'dark', fontSize: 16, autoSave: true, notifications: false },
  };

export const config = {
    fieldNames: { $keys: { $ref: '$.settings' } },
    fieldValues: { $values: { $ref: '$.settings' } },
    fieldCount: { $length: { $keys: { $ref: '$.settings' } } },
  };

export const Demo = () => <PrismView input={input} config={config} />;
