import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { LoomEditorPlugin } from '@react/editor/loom-editor';
import { prismPlugin, NODE, type PrismPluginOptions } from '../index.js';
import { PREVIEW } from '../preview.layout.js';
import { makePreview } from './preview.js';
import { PrismNode } from './node-editor.js';

export type { PrismPluginOptions } from '../index.js';

export const prism = (options: PrismPluginOptions): LoomEditorPlugin => {
  const { name, documents, widgets, mount } = prismPlugin(options);
  const components: Record<string, NovaComponent> = {
    [NODE]: PrismNode,
    [PREVIEW]: makePreview(options.input),
  };
  return { name, documents, widgets, mount, components };
};
