import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { temps: [22, 18, 25, 14, 27, 19] };

export const config = { $min: { over: { $ref: '$.temps' } } };

export const Demo = () => <PrismView input={input} config={config} />;
