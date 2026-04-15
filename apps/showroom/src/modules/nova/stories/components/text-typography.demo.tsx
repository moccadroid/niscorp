import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Exhaustive Text matrix: every size × weight combination, and
// every supported `as` value.

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const WEIGHTS = ['normal', 'medium', 'bold'] as const;
const AS_VALUES = ['p', 'span', 'h1', 'h2', 'h3', 'h4'] as const;

const sizeWeightRows: LayoutNode[] = SIZES.map(
  (size): LayoutNode => ({
    component: 'Stack',
    props: { direction: 'row', gap: 16, align: 'center' },
    children: WEIGHTS.map(
      (weight): LayoutNode => ({
        component: 'Text',
        props: { size, weight },
        children: `size=${size} weight=${weight}`,
      }),
    ),
  }),
);

const asRows: LayoutNode[] = AS_VALUES.map(
  (as): LayoutNode => ({
    component: 'Text',
    props: { as },
    children: `Rendered as <${as}>`,
  }),
);

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    ...sizeWeightRows,
    {
      component: 'Box',
      props: { padding: 0, radius: 0 },
      children: {
        component: 'Stack',
        props: { direction: 'column', gap: 6 },
        children: asRows,
      },
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
