import { createShell } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ShellStory } from '../../story-types';

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

export const replaceWizardStory: ShellStory = {
  id: 'replace-wizard',
  name: 'Replace wizard',
  description:
    'A three-step wizard where each Next replaces the current action with the next step, and Done pops back to a summary action pushed underneath.',
  kind: 'shell',
  category: 'Navigation',
  shellSetup: ({ registry, layoutStore }) =>
    createShell({
      canvases: ['main'],
      registry,
      layoutStore,
      actions: { summary, step1, step2, step3 },
      onError: (err) => {
        console.error(err);
      },
    }),
  initialPushes: [
    { canvas: 'main', actionId: 'summary' },
    { canvas: 'main', actionId: 'step1' },
  ],
  canvases: ['main'],
  expected: { textIncludes: ['Step 1', 'Welcome', 'Next'] },
};
