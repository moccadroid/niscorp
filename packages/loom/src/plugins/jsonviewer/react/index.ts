import type { LoomEditorPlugin } from '@react';
import { jsonviewerPlugin, JSONVIEWER } from '../index.js';
import { JsonViewer } from './jsonviewer.js';

export const jsonviewer = (): LoomEditorPlugin => {
  const { name, documents, mount } = jsonviewerPlugin();
  return { name, documents, mount, components: { [JSONVIEWER]: JsonViewer } };
};
