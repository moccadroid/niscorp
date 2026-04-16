import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { scores: [42, 67, 89, 33, 95, 78] };

export const config = { $max: { over: { $ref: '$.scores' } } };

export const Demo = () => <PrismView input={input} config={config} />;
