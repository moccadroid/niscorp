import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { jsonviewerAction } from './jsonviewer.action.js';

export { JSONVIEWER } from './jsonviewer.layout.js';

export const jsonviewerPlugin = (): LoomPlugin => ({
  name: 'loom:jsonviewer',
  documents: {},
  mount: (editor) => mountView(editor, jsonviewerAction, (e) => ({ value: e.documents })),
});
