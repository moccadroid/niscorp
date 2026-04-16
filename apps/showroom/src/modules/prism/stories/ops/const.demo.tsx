import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';

// Returns a literal JSON value unchanged. The simplest op —
// useful as a building block inside other expressions.

export const input: JsonObject = {};
export const config = { $const: 42 };

export const Demo = () => <PrismView input={input} config={config} />;
