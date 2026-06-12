import type { ZodType } from 'zod';
import { QuerySchema, type DatabaseSchema, type Query } from '@niscorp/vex';
import { mountView } from '@editor/view';
import type { LoomPlugin } from '@editor/types';
import { vexWidgets } from './widgets.js';
import { previewAction } from './preview.action.js';

// @niscorp/loom/plugins/vex — the Vex plugin (framework-free).
//
// Loom edits one document — a Vex query, from Vex's QuerySchema. The plugin
// declares that document, contributes the preview canvas (which runs the query),
// and — when given a database schema — the field-path widgets. The per-framework
// surface (./react) supplies the preview component and the widget renders; this
// core supplies the schema, the widget matchers, and the mount.

export { PREVIEW } from './preview.layout.js';
export type { Query };

export type VexRunResult = {
  rows: unknown[];
  warnings?: string[];
  errors?: string[];
};

export type VexPluginConfig = {
  /** Run an edited query and return its rows (plus any warnings / errors). */
  run: (query: Query) => Promise<VexRunResult>;
  /** The introspected database schema — gives the field-path widgets their
   *  column list. Omit to fall back to plain inputs. */
  db?: DatabaseSchema;
  /** Override the edited schema; defaults to Vex's `QuerySchema`. */
  schema?: ZodType;
};

export const vexPlugin = (config: VexPluginConfig): LoomPlugin => ({
  name: 'vex',
  documents: { query: config.schema ?? (QuerySchema as ZodType) },
  // Widgets only matter with a schema to scope columns against; without `db` the
  // query edits as plain inputs.
  ...(config.db !== undefined ? { widgets: vexWidgets } : {}),
  mount: (editor) =>
    mountView(editor, previewAction, (e) => ({ query: (e.documents as Record<string, unknown>)['query'] })),
});
