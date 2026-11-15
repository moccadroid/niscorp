import type { LoomEditorPlugin } from '@react';
import { validationPlugin, VALIDATION } from '../index.js';
import { JsonPane } from '@react/kit';

export const validation = (): LoomEditorPlugin => {
  const { name, documents, mount } = validationPlugin();
  return { name, documents, mount, components: { [VALIDATION]: JsonPane } };
};
