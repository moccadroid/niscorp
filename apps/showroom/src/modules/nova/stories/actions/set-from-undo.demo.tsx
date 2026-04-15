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

// `{ set, from }` copies one path into another — no literal value.
// Increment snapshots `current` into `previous` *then* bumps
// `current`; Undo copies `previous` back, giving a one-step undo.

const setFromUndo: ActionDefinition = {
  id: 'set-from-undo',
  data: { current: 0, previous: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { size: 'xl', weight: 'bold' },
        children: 'Counter with undo',
      },
      { component: 'Text', children: 'Current: {{$.current}}' },
      { component: 'Text', children: 'Previous: {{$.previous}}' },
      {
        component: 'Stack',
        props: { direction: 'row', gap: 8 },
        children: [
          { component: 'Button', ref: 'inc', children: 'Increment' },
          {
            component: 'Button',
            ref: 'undo',
            props: { variant: 'secondary' },
            children: 'Undo',
          },
        ],
      },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'inc',
      do: [
        { set: 'previous', from: 'current' },
        { increment: 'current' },
      ],
    },
    {
      event: 'ui:click',
      ref: 'undo',
      do: [{ set: 'current', from: 'previous' }],
    },
  ],
};

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'main' }],
  registry,
  layoutStore,
  actions: { 'set-from-undo': setFromUndo },
});
shell.push('main', 'set-from-undo');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
