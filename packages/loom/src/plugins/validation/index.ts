import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { validationAction } from './validation.action.js';

export { VALIDATION } from './validation.layout.js';

export const validationPlugin = (): LoomPlugin => ({
  name: 'loom:validation',
  documents: {},
  mount: (editor) => mountView(editor, validationAction, (e) => ({ value: e.validations })),
});
