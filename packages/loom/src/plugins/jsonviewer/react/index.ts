import type { LoomEditorPlugin } from '@react';
import { jsonviewerPlugin, JSONVIEWER } from '../index.js';
import { JsonPane } from '@react/kit/json-pane.js';

export const jsonviewer = (): LoomEditorPlugin => {
  const { name, documents, mount } = jsonviewerPlugin();
  return { name, documents, mount, components: { [JSONVIEWER]: JsonPane } };
};
