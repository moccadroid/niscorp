import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Three colored Boxes side-by-side. `direction: row`, `gap: 16`,
// `padding: 24`, `align: center` — the simplest horizontal layout.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 16, padding: 24, align: 'center' },
  children: [
    {
      component: 'Box',
      props: { padding: 16, background: '#dbeafe', radius: 8 },
      children: { component: 'Text', props: { weight: 'bold' }, children: 'One' },
    },
    {
      component: 'Box',
      props: { padding: 16, background: '#fef3c7', radius: 8 },
      children: { component: 'Text', props: { weight: 'bold' }, children: 'Two' },
    },
    {
      component: 'Box',
      props: { padding: 16, background: '#dcfce7', radius: 8 },
      children: { component: 'Text', props: { weight: 'bold' }, children: 'Three' },
    },
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
