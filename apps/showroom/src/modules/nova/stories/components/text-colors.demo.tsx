import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Prop values go through template interpolation — so `color` can
// read from data instead of being a literal. Swap the data tree
// to theme every Text without touching the layout.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.red}}' }, children: 'Red' },
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.blue}}' }, children: 'Blue' },
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.green}}' }, children: 'Green' },
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.purple}}' }, children: 'Purple' },
  ],
};

const data = {
  colors: {
    red: '#dc2626',
    blue: '#2563eb',
    green: '#16a34a',
    purple: '#9333ea',
  },
};

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
