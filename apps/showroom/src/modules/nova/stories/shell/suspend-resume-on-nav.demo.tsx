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

// All four lifecycle hooks on a single action. Each hook pushes its
// own name onto an events log, so the log doubles as a live trace.
// Navigating to `inner` suspends `outer`; popping back resumes it —
// each round-trip adds `suspend` then `resume` to the log.

const outer: ActionDefinition = {
  id: 'outer',
  data: { events: [] },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Outer screen' },
      { component: 'Text', children: 'Lifecycle events on this action:' },
      {
        for: '$.events',
        as: 'evt',
        do: {
          component: 'Box',
          props: { padding: 8, background: '#f1f5f9', radius: 4 },
          children: { component: 'Text', children: '{{$evt}}' },
        },
      },
      { component: 'Button', ref: 'go-inner', children: 'Open inner screen' },
    ],
  },
  lifecycle: {
    mount: [{ push: 'events', value: 'mount' }],
    suspend: [{ push: 'events', value: 'suspend' }],
    resume: [{ push: 'events', value: 'resume' }],
    unmount: [{ push: 'events', value: 'unmount' }],
  },
  triggers: [
    { event: 'ui:click', ref: 'go-inner', do: [{ push: { action: 'inner' } }] },
  ],
};

const inner: ActionDefinition = {
  id: 'inner',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Inner screen' },
      {
        component: 'Text',
        children: 'The outer action is now suspended. Click Back to resume it.',
      },
      {
        component: 'Button',
        ref: 'back',
        props: { variant: 'secondary' },
        children: 'Back',
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'back', do: [{ pop: true }] },
  ],
};

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'main' }],
  registry,
  layoutStore,
  actions: { outer, inner },
});
shell.push('main', 'outer');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
