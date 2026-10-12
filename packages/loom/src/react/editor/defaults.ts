import { jsonviewer } from '@plugins/jsonviewer/react';
import { validation } from '@plugins/validation/react';
import type { LoomEditorPlugin } from './loom-editor.js';

export const defaultPlugins = (): LoomEditorPlugin[] => [jsonviewer(), validation()];
