import type { LoomEditorPlugin } from '@react';
import { validationPlugin, VALIDATION } from '../index.js';
import { Validation } from './validation.js';

export const validation = (): LoomEditorPlugin => {
  const { name, documents, mount } = validationPlugin();
  return { name, documents, mount, components: { [VALIDATION]: Validation } };
};
