import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { layoutSchema, type NovaComponentShape } from './schema.js';
import { dataLayout } from './data.layout.js';
import { previewAction } from './preview.action.js';

export { PREVIEW } from './preview.layout.js';
export { layoutSchema, type NovaComponentShape } from './schema.js';

export type NovaPluginConfig = { manifest: readonly NovaComponentShape[] };

export const novaPlugin = (config: NovaPluginConfig): LoomPlugin => ({
  name: 'nova',
  documents: {
    layout: layoutSchema(config.manifest),
    data: dataLayout,
  },
  mount: (editor) => mountView(editor, previewAction, (e) => ({ documents: e.documents })),
});
