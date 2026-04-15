import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// A row of Buttons covering each variant plus a disabled state.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 12, padding: 24, align: 'center' },
  children: [
    { component: 'Button', props: { variant: 'primary' }, children: 'Primary' },
    { component: 'Button', props: { variant: 'secondary' }, children: 'Secondary' },
    { component: 'Button', props: { variant: 'ghost' }, children: 'Ghost' },
    { component: 'Button', props: { variant: 'primary', disabled: true }, children: 'Disabled' },
  ],
};

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();
const nodes = renderLayout(layout, {}, { store: layoutStore, registry });

const noop = (): void => {};

export const Demo = () => (
  <NovaRenderProvider registry={registry} dispatch={noop} publish={noop}>
    <RenderTree nodes={nodes} />
  </NovaRenderProvider>
);
