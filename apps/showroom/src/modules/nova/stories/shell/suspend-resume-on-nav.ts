import { createShell } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ShellStory } from '../../story-types';

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

export const suspendResumeOnNavStory: ShellStory = {
  id: 'suspend-resume-on-nav',
  name: 'Suspend / resume on navigation',
  description:
    "Demonstrates the four lifecycle hooks (mount, unmount, suspend, resume). The outer action's lifecycle hooks each push their name onto the events log. Click 'Open inner screen' — the outer action SUSPENDS (the 'suspend' hook fires) and the inner action MOUNTS. Click Back on the inner screen — the inner UNMOUNTS and the outer RESUMES (the 'resume' hook fires). Each round-trip appends both 'suspend' and 'resume' to the outer's log, so the list grows by two on every push/pop cycle.",
  kind: 'shell',
  category: 'Lifecycle',
  shellSetup: ({ registry, layoutStore }) =>
    createShell({
      canvases: ['main'],
      registry,
      layoutStore,
      actions: { outer, inner },
      onError: (err) => {
        console.error(err);
      },
    }),
  initialPushes: [{ canvas: 'main', actionId: 'outer' }],
  canvases: ['main'],
  expected: {
    textIncludes: ['Outer screen', 'Lifecycle events on this action', 'mount', 'Open inner screen'],
  },
};
