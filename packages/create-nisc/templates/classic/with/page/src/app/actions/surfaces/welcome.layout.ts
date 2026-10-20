import type { LayoutNode } from '@niscorp/nova';

export const welcomeLayout: LayoutNode = {
  component: 'Page',
  children: [
    {
      component: 'nova:head',
      children: [
        { component: 'nova:title', children: '{{$.name}}' },
        { component: 'nova:meta', props: { name: 'description', content: 'A nisc app with its own shell.' } },
      ],
    },
    { component: 'Heading', children: '{{$.name}}' },
    {
      component: 'Text',
      props: { tone: 'muted' },
      children: 'A nisc app with its own shell — no server. This screen is an action on a canvas; the page arrived drawn (nisc export wrote it), and the shell in this page picked it up.',
    },
    {
      component: 'Row',
      children: [
        { component: 'Button', ref: 'press', props: { label: 'Press' } },
        { component: 'Text', children: 'Presses: {{$.presses}}' },
      ],
    },
    {
      component: 'Text',
      props: { tone: 'muted' },
      children: 'Start in PLAN.md. The rules this app is built by are in AGENTS.md.',
    },
  ],
};
