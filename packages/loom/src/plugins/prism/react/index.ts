import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { LoomEditorPlugin } from '@react/editor/loom-editor';
import { prismPlugin, NODE, type PrismPluginOptions } from '../index.js';
import { PREVIEW } from '../preview.layout.js';
import { makePreview } from './preview.js';
import { PrismNode } from './node-editor.js';

// @niscorp/loom/plugins/prism/react — the React surface for the Prism plugin.
//
// `prism(options)` assembles the core plugin with its two components: the
// recursive node editor (the `prism:node` widget that edits the config) and the
// preview, which applies the edited config to `options.input` and shows the
// output.

export type { PrismPluginOptions } from '../index.js';

export const prism = (options: PrismPluginOptions): LoomEditorPlugin => {
  const { name, documents, widgets, mount } = prismPlugin(options);
  const components: Record<string, NovaComponent> = {
    [NODE]: PrismNode,
    [PREVIEW]: makePreview(options.input),
  };
  return { name, documents, widgets, mount, components };
};
