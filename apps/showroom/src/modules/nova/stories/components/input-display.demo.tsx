import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Inputs with one-way `value` bindings via `{{…}}` templates. No
// `model`, so typing doesn't write back to the data. The last
// input is disabled with a static value — the read-only style.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    { component: 'Input', props: { value: '{{$.firstName}}', placeholder: 'First name' } },
    { component: 'Input', props: { value: '{{$.lastName}}', placeholder: 'Last name' } },
    { component: 'Input', props: { value: '{{$.email}}', placeholder: 'Email' } },
    { component: 'Input', props: { value: 'Read only', disabled: true } },
  ],
};

const data = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
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
