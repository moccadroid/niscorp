import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { jsonviewerAction } from './jsonviewer.action.js';

// @niscorp/loom/plugins/jsonviewer — a default plugin (framework-free).
//
// A read-only JSON view of the editor's live documents. Loaded first, so a domain
// plugin (nova, vex) loaded later can remove its canvas or re-arrange the shell.
// Contributes no documents — it edits nothing, it mirrors what the forms hold.

export { JSONVIEWER } from './jsonviewer.layout.js';

export const jsonviewerPlugin = (): LoomPlugin => ({
  name: 'loom:jsonviewer',
  documents: {},
  mount: (editor) => mountView(editor, jsonviewerAction, (e) => ({ value: e.documents })),
});
