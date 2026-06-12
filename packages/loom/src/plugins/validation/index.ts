import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { validationAction } from './validation.action.js';

// @niscorp/loom/plugins/validation — a default plugin (framework-free).
//
// A read-only JSON view of the editor's validation problems (per document, keyed
// the same as `documents`). Loaded first; overridable like any default.
// Contributes no documents — it mirrors the forms' validation state.

export { VALIDATION } from './validation.layout.js';

export const validationPlugin = (): LoomPlugin => ({
  name: 'loom:validation',
  documents: {},
  mount: (editor) => mountView(editor, validationAction, (e) => ({ value: e.validations })),
});
