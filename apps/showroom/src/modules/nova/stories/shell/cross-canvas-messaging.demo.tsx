import {
  createComponentRegistry,
  createLayoutStore,
  createShell,
  type ActionDefinition,
} from '@niscorp/nova';
import {
  NovaShellProvider,
  RenderTree,
  useShellRenderTree,
  type NovaComponent,
} from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Two canvases that don't share data — they talk via the shell's
// message bus instead. Producer emits on the `cart-updated`
// channel; Consumer listens with a `message:` trigger and bumps
// its own counter. No direct coupling between their data stores.

const producer: ActionDefinition = {
  id: 'producer',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Producer' },
      { component: 'Button', ref: 'add', children: 'Add to cart' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'add', do: [{ emit: { channel: 'cart-updated' } }] },
  ],
};

const consumer: ActionDefinition = {
  id: 'consumer',
  data: { count: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Consumer' },
      { component: 'Text', children: 'Cart count: {{$.count}}' },
    ],
  },
  triggers: [
    { message: 'cart-updated', do: [{ increment: 'count' }] },
  ],
};

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'producer' }, { id: 'consumer' }],
  registry,
  layoutStore,
  actions: { producer, consumer },
});
shell.push('producer', 'producer');
shell.push('consumer', 'consumer');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
