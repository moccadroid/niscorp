import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// `$index` is an implicit scope variable inside every `for` loop.
// Mixing `{{$index}}` with `{{$item.name}}` in a single Text yields
// a zero-indexed numbered list straight from a flat data array.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    {
      component: 'Text',
      props: { weight: 'bold', size: 'lg' },
      children: 'Numbered list',
    },
    {
      for: '$.items',
      as: 'item',
      do: {
        component: 'Box',
        props: { padding: 8, background: '#f1f5f9', radius: 4 },
        children: {
          component: 'Text',
          children: '{{$index}}. {{$item.name}}',
        },
      },
    },
  ],
};

const data = {
  items: [{ name: 'Apple' }, { name: 'Banana' }, { name: 'Cherry' }, { name: 'Date' }],
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
