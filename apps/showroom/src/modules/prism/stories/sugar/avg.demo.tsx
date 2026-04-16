import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { scores: [80, 90, 100, 70] };

export const config = { $avg: { over: { $ref: '$.scores' } } };

export const Demo = () => <PrismView input={input} config={config} />;
