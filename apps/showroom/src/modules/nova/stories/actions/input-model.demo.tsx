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

// Two-way `model` binding on Input. Keystrokes write through to
// `$.name`; the greeting Text reads the same path via `{{$.name}}`,
// so the heading updates live as you type.

const inputModel: ActionDefinition = {
  id: 'input-model',
  data: { name: '' },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { size: 'lg' },
        children: 'Hello, {{$.name}}!',
      },
      {
        component: 'Input',
        model: '$.name',
        props: { placeholder: 'Type your name' },
      },
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
  actions: { 'input-model': inputModel },
});
shell.push('main', 'input-model');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
