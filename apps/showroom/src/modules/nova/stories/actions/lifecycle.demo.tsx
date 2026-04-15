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

// The `mount` hook fires once when the action starts. Two ops run:
// `set mounted: true` and `push events: "mount"`. The view reads
// both paths back — proving the hook ran exactly once.

const lifecycle: ActionDefinition = {
  id: 'lifecycle',
  data: { mounted: false, events: [] },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold' },
        children: 'Mounted: {{$.mounted}}',
      },
      { component: 'Text', children: 'Event count: {{$.events.length}}' },
    ],
  },
  lifecycle: {
    mount: [
      { set: 'mounted', value: true },
      { push: 'events', value: 'mount' },
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
  actions: { lifecycle },
});
shell.push('main', 'lifecycle');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
