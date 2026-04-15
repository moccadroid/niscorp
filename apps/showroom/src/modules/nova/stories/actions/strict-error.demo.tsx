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

// Lax-mode error handling: the layout references a `Nonexistent`
// component that isn't in the registry. The renderer emits an error
// RenderNode in place of the missing component — the surrounding
// Stack and Text still render. Nothing crashes.

const strictError: ActionDefinition = {
  id: 'strict-error',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      {
        component: 'Text',
        children: 'About to reference an unknown component:',
      },
      { component: 'Nonexistent' },
    ],
  },
};

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'main' }],
  registry,
  layoutStore,
  actions: { 'strict-error': strictError },
});
shell.push('main', 'strict-error');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
