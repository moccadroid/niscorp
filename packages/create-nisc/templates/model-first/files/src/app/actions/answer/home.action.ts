import type { ActionDefinition } from '@niscorp/nova';
import { ANSWERS } from '../../answers';
import { askExample, examplesLayout } from './examples.layout';

export const homeAction: ActionDefinition = {
  id: 'answer.home',
  title: 'Welcome',
  description: 'What the app is, before anything was asked, and a few things to ask it.',
  data: { name: 'nisc-template-app', examples: ANSWERS.map((answer) => answer.example) },
  layout: {
    component: 'Card',
    props: { title: '{{$.name}}' },
    children: [
      { component: 'Text', children: 'Ask for something below. The answer is a screen, put together from this app’s actions.' },
      examplesLayout,
      { component: 'Text', props: { tone: 'muted' }, children: 'Start in PLAN.md. The rules this app is built by are in AGENTS.md.' },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'example', do: askExample }],
};
