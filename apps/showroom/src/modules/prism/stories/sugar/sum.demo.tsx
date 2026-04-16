import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { values: [10, 20, 30, 40] };

export const config = { $sum: { over: { $ref: '$.values' } } };

export const Demo = () => <PrismView input={input} config={config} />;
