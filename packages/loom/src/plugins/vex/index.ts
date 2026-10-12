import type { ZodType } from 'zod';
import { QuerySchema, type DatabaseSchema, type Query } from '@niscorp/vex';
import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { vexWidgets } from './widgets.js';
import { previewAction } from './preview.action.js';

export { PREVIEW } from './preview.layout.js';
export type { Query };

export type VexRunResult = {
  rows: unknown[];
  warnings?: string[];
  errors?: string[];
};

export type VexPluginConfig = {
  run: (query: Query) => Promise<VexRunResult>;
  db?: DatabaseSchema;
  schema?: ZodType;
};

export const vexPlugin = (config: VexPluginConfig): LoomPlugin => ({
  name: 'vex',
  documents: { query: config.schema ?? (QuerySchema as ZodType) },
  ...(config.db !== undefined ? { widgets: vexWidgets } : {}),
  mount: (editor) =>
    mountView(editor, previewAction, (e) => ({ query: (e.documents as Record<string, unknown>)['query'] })),
});
