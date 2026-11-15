import { mountView, type LoomPlugin } from '@editor';
import { validationAction } from './validation.action.js';

export { VALIDATION } from './validation.layout.js';

export const validationPlugin = (): LoomPlugin => ({
  name: 'loom:validation',
  documents: {},
  mount: (editor) => mountView(editor, validationAction, (e) => ({ value: e.validations })),
});
