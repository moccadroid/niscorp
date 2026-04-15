import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Raw `$.foo.bar` paths as Text children. At render time the
// renderer resolves each path against the data tree and swaps
// in the value — no template braces needed for a pure path.

const layout: LayoutNode = {
  component: 'Box',
  props: { padding: 24, background: '#eef2ff', radius: 8 },
  children: {
    component: 'Stack',
    props: { direction: 'column', gap: 8 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: '$.user.name' },
      { component: 'Text', props: { size: 'sm', color: '#475569' }, children: '$.user.title' },
      { component: 'Text', props: { size: 'sm', color: '#64748b' }, children: '$.user.email' },
    ],
  },
};

const data = {
  user: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    title: 'Mathematician',
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
