import { createShell } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ShellStory } from '../../story-types';

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
      {
        component: 'Button',
        ref: 'go-profile',
        props: { variant: 'secondary' },
        children: 'Profile',
      },
      { component: 'Button', ref: 'go-help', props: { variant: 'ghost' }, children: 'Help' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'go-settings', do: [{ push: { action: 'settings' } }] },
    { event: 'ui:click', ref: 'go-profile', do: [{ push: { action: 'profile' } }] },
    { event: 'ui:click', ref: 'go-help', do: [{ push: { action: 'help' } }] },
  ],
};

const buildScreen = (id: string, title: string, body: string): ActionDefinition => ({
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

const settings = buildScreen('settings', 'Settings', 'Tweak your preferences here.');
const profile = buildScreen('profile', 'Profile', 'Your account details.');
const help = buildScreen('help', 'Help', 'Read the documentation.');

export const pushPopNavigationStory: ShellStory = {
  id: 'push-pop-navigation',
  name: 'Push / pop navigation',
  description:
    'A menu action with three buttons. Each pushes a screen onto the canvas; each screen has a Back button that pops. Watch the Stack tab in the inspector to see the canvas stack grow and shrink.',
  kind: 'shell',
  category: 'Navigation',
  shellSetup: ({ registry, layoutStore }) =>
    createShell({
      canvases: ['main'],
      registry,
      layoutStore,
      actions: { menu, settings, profile, help },
      onError: (err) => {
        console.error(err);
      },
    }),
  initialPushes: [{ canvas: 'main', actionId: 'menu' }],
  canvases: ['main'],
  expected: { textIncludes: ['Main Menu', 'Settings', 'Profile', 'Help'] },
};
