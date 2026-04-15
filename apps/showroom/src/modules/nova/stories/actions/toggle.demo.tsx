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

// `toggle` flips a boolean in place. Paired with `if/then/else` the
// same click swaps the visible subtree between the two branches.

const toggle: ActionDefinition = {
  id: 'toggle',
  data: { enabled: false },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        if: '$.enabled',
        then: {
          component: 'Text',
          props: { weight: 'bold', color: '#16a34a' },
          children: 'Enabled',
        },
        else: {
          component: 'Text',
          props: { weight: 'bold', color: '#dc2626' },
          children: 'Disabled',
        },
      },
      { component: 'Button', ref: 'flip', children: 'Toggle' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'flip', do: [{ toggle: 'enabled' }] },
  ],
};

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'main' }],
  registry,
  layoutStore,
  actions: { toggle },
});
shell.push('main', 'toggle');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
