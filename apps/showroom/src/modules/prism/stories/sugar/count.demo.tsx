import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { items: ['apple', 'banana', 'cherry', 'date', 'elderberry'] };

export const config = { $count: { over: { $ref: '$.items' } } };

export const Demo = () => <PrismView input={input} config={config} />;
