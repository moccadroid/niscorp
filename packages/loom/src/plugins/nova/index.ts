import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { layoutSchema, type NovaComponentShape } from './schema.js';
import { dataLayout } from './data.layout.js';
import { previewAction } from './preview.action.js';

// @niscorp/loom/plugins/nova — the Nova plugin (framework-free).
//
// A Nova layout has two documents: the `layout` (a component tree, its schema
// derived from the component manifest) and the `data` its bindings (`$.x`)
// resolve against. The plugin declares both and contributes the preview canvas;
// the per-framework surface (./react) supplies the preview component.

export { PREVIEW } from './preview.layout.js';
export { layoutSchema, type NovaComponentShape } from './schema.js';

export type NovaPluginConfig = { manifest: readonly NovaComponentShape[] };

export const novaPlugin = (config: NovaPluginConfig): LoomPlugin => ({
  name: 'nova',
  documents: {
    layout: layoutSchema(config.manifest),
    // `data` is freeform (its shape follows the layout's bindings), so it has no
    // schema. The plugin builds its editing layout from the data's keys instead.
    data: dataLayout,
  },
  // The preview is a Nova concept, not a Loom one, so the plugin contributes it:
  // a view canvas rendering the preview component bound to the live documents.
  mount: (editor) => mountView(editor, previewAction, (e) => ({ documents: e.documents })),
});
