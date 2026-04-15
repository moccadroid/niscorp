import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Nonexistent paths resolve to empty strings inside templates —
// the layout still renders cleanly even when the data is partial.
// No throws, no "undefined" leaking into the UI.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    { component: 'Text', children: 'Existing: {{$.existing}}' },
    { component: 'Text', children: 'Missing template: <{{$.missing.deep.path}}>' },
    { component: 'Text', children: '$.also.missing' },
  ],
};

const data = { existing: 'I am here' };

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();
const nodes = renderLayout(layout, data, { store: layoutStore, registry });

const noop = (): void => {};

export const Demo = () => (
  <NovaRenderProvider registry={registry} dispatch={noop} publish={noop}>
    <RenderTree nodes={nodes} />
  </NovaRenderProvider>
);
