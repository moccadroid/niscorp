import type { LoomEditorPlugin } from '@react';
import { jsonviewerPlugin, JSONVIEWER } from '../index.js';
import { JsonViewer } from './jsonviewer.js';

// @niscorp/loom/plugins/jsonviewer/react — the React surface: the plugin assembled
// with its own view component, registered under the plugin's view id.
export const jsonviewer = (): LoomEditorPlugin => {
  const { name, documents, mount } = jsonviewerPlugin();
  return { name, documents, mount, components: { [JSONVIEWER]: JsonViewer } };
};
