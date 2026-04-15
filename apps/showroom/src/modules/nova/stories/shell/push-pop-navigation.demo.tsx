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

// A menu with three buttons, each pushing a screen onto the canvas.
// Every screen has a Back button that pops. The canvas stack grows
// and shrinks as the user navigates.

const menu: ActionDefinition = {
  id: 'menu',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Main Menu' },
      { component: 'Text', children: 'Pick a screen:' },
      { component: 'Button', ref: 'go-settings', children: 'Settings' },
      { component: 'Button', ref: 'go-profile', props: { variant: 'secondary' }, children: 'Profile' },
      { component: 'Button', ref: 'go-help', props: { variant: 'ghost' }, children: 'Help' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'go-settings', do: [{ push: { action: 'settings' } }] },
    { event: 'ui:click', ref: 'go-profile', do: [{ push: { action: 'profile' } }] },
    { event: 'ui:click', ref: 'go-help', do: [{ push: { action: 'help' } }] },
  ],
};

const screen = (id: string, title: string, body: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: title },
      { component: 'Text', children: body },
      { component: 'Button', ref: 'back', props: { variant: 'secondary' }, children: 'Back' },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'back', do: [{ pop: true }] }],
});

const settings = screen('settings', 'Settings', 'Tweak your preferences here.');
const profile = screen('profile', 'Profile', 'Your account details.');
const help = screen('help', 'Help', 'Read the documentation.');

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'main' }],
  registry,
  layoutStore,
  actions: { menu, settings, profile, help },
});
shell.push('main', 'menu');

// Showroom-only: the inspector reads live shell state from here.
export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
