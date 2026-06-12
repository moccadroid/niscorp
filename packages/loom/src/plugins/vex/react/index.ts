import type { NovaComponent } from '@niscorp/nova/react';
import type { LoomEditorPlugin } from '@react/editor/loom-editor';
import { vexPlugin, type VexPluginConfig } from '../index.js';
import { PREVIEW } from '../preview.layout.js';
import { catalogOf, VEX_COMPARISON, VEX_FIELD_PATH, VEX_AGGREGATE, VEX_COMPUTE } from '../widgets.js';
import { makePreview } from './preview.js';
import { comparisonWidget, fieldPathWidget } from './operands.js';
import { aggregateWidget, computeWidget } from './records.js';

// @niscorp/loom/plugins/vex/react — the React surface for the Vex plugin.
//
// `vex(config)` assembles the core plugin with its components: the preview (which
// runs `config.run`) and, when `config.db` is given, the field-path widget renders
// (closures over the column catalog). The widget matchers live in the core; these
// fill their roles.

export type { VexPluginConfig, VexRunResult } from '../index.js';

export const vex = (config: VexPluginConfig): LoomEditorPlugin => {
  const { name, documents, mount, widgets } = vexPlugin(config);
  const components: Record<string, NovaComponent> = { [PREVIEW]: makePreview(config.run) };
  if (config.db !== undefined) {
    const catalog = catalogOf(config.db);
    components[VEX_COMPARISON] = comparisonWidget(catalog);
    components[VEX_FIELD_PATH] = fieldPathWidget(catalog);
    components[VEX_AGGREGATE] = aggregateWidget(catalog);
    components[VEX_COMPUTE] = computeWidget(catalog);
  }
  return { name, documents, mount, widgets, components };
};
