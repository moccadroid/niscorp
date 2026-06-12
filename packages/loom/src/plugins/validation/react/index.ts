import type { LoomEditorPlugin } from '@react';
import { validationPlugin, VALIDATION } from '../index.js';
import { Validation } from './validation.js';

// @niscorp/loom/plugins/validation/react — the React surface: the plugin assembled
// with its own view component, registered under the plugin's view id.
export const validation = (): LoomEditorPlugin => {
  const { name, documents, mount } = validationPlugin();
  return { name, documents, mount, components: { [VALIDATION]: Validation } };
};
