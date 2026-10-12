import type { ZodType } from 'zod';
import { NodeSchema, type Config, type JsonObject, type JsonValue } from '@niscorp/prism';
import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { previewAction } from './preview.action.js';

export { PREVIEW } from './preview.layout.js';
export type { Config, JsonObject, JsonValue };

export const NODE = 'prism:node';

export type PrismPluginOptions = {
  input: JsonObject;
  schema?: ZodType;
};

export const prismPlugin = (options: PrismPluginOptions): LoomPlugin => ({
  name: 'prism',
  documents: { config: options.schema ?? (NodeSchema as ZodType) },
  widgets: [{ role: NODE, match: (field) => field.kind === 'union' && field.path === '' }],
  mount: (editor) =>
    mountView(editor, previewAction, (e) => ({ config: (e.documents as Record<string, unknown>)['config'] })),
});
