import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

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

const shell = createShell({
  canvases: [{ id: 'main', initial: 'input-model' }],
  actions: { 'input-model': inputModel },
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
