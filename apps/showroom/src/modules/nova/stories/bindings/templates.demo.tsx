import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// `{{…}}` template interpolation inside Text children. Literal
// copy and `{{$.path}}` placeholders mix on the same line;
// the renderer expands each one in place.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    {
      component: 'Text',
      props: { size: 'lg', weight: 'bold' },
      children: 'Welcome, {{$.name}}! You have {{$.unread}} unread messages.',
    },
    {
      component: 'Text',
      props: { size: 'sm', color: '#6b7280' },
      children: 'Your account ID is #{{$.accountId}}.',
    },
  ],
};

const data = { name: 'Grace', unread: 7, accountId: 'A-9842' };

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
