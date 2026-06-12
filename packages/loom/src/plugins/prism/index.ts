import type { ZodType } from 'zod';
import { NodeSchema, type Config, type JsonObject, type JsonValue } from '@niscorp/prism';
import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { previewAction } from './preview.action.js';

// @niscorp/loom/plugins/prism — the Prism plugin (framework-free).
//
// Loom edits one document, a Prism config (a recursive union of transform
// operations). The plugin declares it and contributes a preview canvas that
// applies the config to a sample input and shows the output. The per-framework
// surface (./react) supplies the preview component; this core supplies the
// schema and the mount.
//
// The edited schema is Prism's `NodeSchema`, not `ConfigSchema`. The two are
// equivalent (`ConfigSchema = NodeSchema.describe(...)`), but `NodeSchema` is the
// stable lazy the recursive fields point back to, so it compiles to a single
// recursive union instead of unrolling one redundant level.

export { PREVIEW } from './preview.layout.js';
export type { Config, JsonObject, JsonValue };

// The role the recursive node editor renders under. The match is framework-free
// (it lives here); the React surface supplies the component. It claims the
// document root: the whole config is one Prism node, edited by one recursive
// widget rather than Loom's static field compilation.
export const NODE = 'prism:node';

export type PrismPluginOptions = {
  /** Sample source data the edited config is applied to in the preview. */
  input: JsonObject;
  /** Override the edited schema; defaults to Prism's `NodeSchema`. */
  schema?: ZodType;
};

export const prismPlugin = (options: PrismPluginOptions): LoomPlugin => ({
  name: 'prism',
  documents: { config: options.schema ?? (NodeSchema as ZodType) },
  widgets: [{ role: NODE, match: (field) => field.kind === 'union' && field.path === '' }],
  mount: (editor) =>
    mountView(editor, previewAction, (e) => ({ config: (e.documents as Record<string, unknown>)['config'] })),
});
