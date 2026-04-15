import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Empty-collection pattern: an `if` guards the `for` loop so an
// empty array shows a gray placeholder instead of a blank space.
// The `then` branch is the loop; the `else` branch is the fallback.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    {
      component: 'Text',
      props: { weight: 'bold', size: 'lg' },
      children: 'Items',
    },
    {
      if: '$.items.length',
      then: {
        for: '$.items',
        as: 'item',
        do: { component: 'Text', children: '{{$item.name}}' },
      },
      else: {
        component: 'Text',
        props: { color: '#9ca3af' },
        children: 'No items yet.',
      },
    },
  ],
};

const data = { items: [] };

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
