import { mountView, type LoomPlugin } from '@editor';
import { jsonviewerAction } from './jsonviewer.action.js';

export { JSONVIEWER } from './jsonviewer.layout.js';

export const jsonviewerPlugin = (): LoomPlugin => ({
  name: 'loom:jsonviewer',
  documents: {},
  mount: (editor) => mountView(editor, jsonviewerAction, (e) => ({ value: e.documents })),
});
