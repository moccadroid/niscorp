import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { price: 99, tax: 8 };

export const config = { $add: [{ $ref: '$.price' }, { $ref: '$.tax' }] };

export const Demo = () => <PrismView input={input} config={config} />;
