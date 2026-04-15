import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Every align × justify combination on a row Stack. Build the
// layout programmatically to cover the full matrix.

const ALIGN_VALUES = ['start', 'center', 'end'] as const;
const JUSTIFY_VALUES = ['start', 'center', 'end', 'between'] as const;

const swatch = (label: string): LayoutNode => ({
  component: 'Box',
  props: { padding: 8, background: '#dbeafe', radius: 4 },
  children: { component: 'Text', props: { size: 'sm' }, children: label },
});

const row = (align: (typeof ALIGN_VALUES)[number]): LayoutNode => ({
  component: 'Stack',
  props: { direction: 'column', gap: 6 },
  children: [
    { component: 'Text', props: { size: 'sm', weight: 'bold' }, children: `align=${align}` },
    {
      component: 'Stack',
      props: { direction: 'row', gap: 12 },
      children: JUSTIFY_VALUES.map(
        (justify): LayoutNode => ({
          component: 'Box',
          props: { padding: 8, border: true, radius: 4 },
          children: {
            component: 'Stack',
            props: { direction: 'row', gap: 6, align, justify },
            children: [swatch('A'), swatch('B'), swatch('C')],
          },
        }),
      ),
    },
  ],
});

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 16, padding: 24 },
  children: ALIGN_VALUES.map((a) => row(a)),
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
