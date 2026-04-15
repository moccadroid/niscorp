import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { tags: ['frontend', 'backend', 'devops', 'frontend-react', 'database'] };

export const config = { $match: { over: { $ref: '$.tags' }, as: 'tag', search: { $const: 'front' } } };

export const Demo = () => <PrismView input={input} config={config} />;
