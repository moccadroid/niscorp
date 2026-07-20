import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

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

const shell = createShell({
  canvases: [{ id: 'main', initial: 'lifecycle' }],
  actions: { lifecycle },
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
