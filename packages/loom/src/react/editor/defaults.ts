import { jsonviewer } from '@plugins/jsonviewer/react';
import { validation } from '@plugins/validation/react';
import type { LoomEditorPlugin } from './loom-editor.js';

// The default view plugins, as a preset. <LoomEditor> bakes in nothing — an app
// that wants the live Data / Validations JSON panes spreads these at the FRONT of
// its `plugins` list, so domain plugins (nova, vex) load after and can override or
// remove them. Omit it for a bare editor.
export const defaultPlugins = (): LoomEditorPlugin[] => [jsonviewer(), validation()];
