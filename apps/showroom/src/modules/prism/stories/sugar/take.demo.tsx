import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { numbers: [10, 20, 30, 40, 50, 60, 70, 80] };

export const config = { $take: { from: { $ref: '$.numbers' }, count: 3 } };

export const Demo = () => <PrismView input={input} config={config} />;
