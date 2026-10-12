import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { LoomEditorPlugin } from '@react/editor/loom-editor';
import { vexPlugin, type VexPluginConfig } from '../index.js';
import { PREVIEW } from '../preview.layout.js';
import { catalogOf, VEX_COMPARISON, VEX_FIELD_PATH, VEX_AGGREGATE, VEX_COMPUTE } from '../widgets.js';
import { makePreview } from './preview.js';
import { comparisonWidget, fieldPathWidget } from './operands.js';
import { aggregateWidget, computeWidget } from './records.js';

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
