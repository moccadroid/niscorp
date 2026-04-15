import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// A three-step wizard. Each Next `replace`s the current action
// with the next one — the stack depth stays at 2. A `summary`
// action is pushed underneath before step 1, so the final Done
// pops back to it instead of an empty canvas.

const step1: ActionDefinition = {
  id: 'step1',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Step 1: Welcome' },
      { component: 'Text', children: 'Start the wizard by clicking Next.' },
      { component: 'Button', ref: 'next', children: 'Next' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'next', do: [{ replace: { action: 'step2' } }] },
  ],
};

const step2: ActionDefinition = {
  id: 'step2',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Step 2: Configure' },
      { component: 'Text', children: 'Adjust some settings, then click Next.' },
      { component: 'Button', ref: 'next', children: 'Next' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'next', do: [{ replace: { action: 'step3' } }] },
  ],
};

const step3: ActionDefinition = {
  id: 'step3',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Step 3: Review' },
      { component: 'Text', children: 'Review your choices and click Done to finish.' },
      { component: 'Button', ref: 'done', children: 'Done' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'done', do: [{ pop: true }] },
  ],
};

const summary: ActionDefinition = {
  id: 'summary',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Wizard complete!' },
      { component: 'Text', children: 'You have finished the wizard.' },
    ],
  },
};

const shell = createShell({
  canvases: [{ id: 'main', initial: ['summary', 'step1'] }],
  actions: { summary, step1, step2, step3 },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
