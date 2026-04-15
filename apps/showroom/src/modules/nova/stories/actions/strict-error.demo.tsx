import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

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

const shell = createShell({
  canvases: [{ id: 'main', initial: 'strict-error' }],
  actions: { 'strict-error': strictError },
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
