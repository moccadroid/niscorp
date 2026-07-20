import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// An action with a data store and two triggers. Click Increment /
// Decrement — the trigger fires the `increment`/`decrement` op on
// the `count` path, the data store updates, and the Text re-renders
// with the new value.

const counter: ActionDefinition = {
  id: 'counter',
  data: { count: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { size: 'xl', weight: 'bold' },
        children: 'Count: {{$.count}}',
      },
      {
        component: 'Stack',
        props: { direction: 'row', gap: 8 },
        children: [
          { component: 'Button', ref: 'inc', children: 'Increment' },
          { component: 'Button', ref: 'dec', props: { variant: 'secondary' }, children: 'Decrement' },
        ],
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'inc', do: [{ increment: 'count' }] },
    { event: 'ui:click', ref: 'dec', do: [{ decrement: 'count' }] },
  ],
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'counter' }],
  actions: { counter },
});

// Showroom-only: the inspector reads live shell state from here.
export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
