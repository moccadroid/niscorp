import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Reusable layouts live in the layout store, keyed by name. A
// `{ ref: 'user-card' }` node resolves to that template at render
// time — so two refs produce two identical cards from a single
// source.

const userCard: LayoutNode = {
  component: 'Box',
  props: { padding: 16, background: '#eef2ff', radius: 8 },
  children: {
    component: 'Stack',
    props: { direction: 'column', gap: 4 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold', size: 'lg' },
        children: '{{$.name}}',
      },
      {
        component: 'Text',
        props: { size: 'sm', color: '#6b7280' },
        children: '{{$.email}}',
      },
    ],
  },
};

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [{ ref: 'user-card' }, { ref: 'user-card' }],
};

const data = { name: 'Ada', email: 'ada@example.com' };

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();
layoutStore.set('user-card', userCard);
const nodes = renderLayout(layout, data, { store: layoutStore, registry });

const noop = (): void => {};

export const Demo = () => (
  <NovaRenderProvider registry={registry} dispatch={noop} publish={noop}>
    <RenderTree nodes={nodes} />
  </NovaRenderProvider>
);
