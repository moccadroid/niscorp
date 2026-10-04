import type { LayoutNode } from '@niscorp/nova';

// JSON, bound to the action's data. Every component name is one the kit in
// src/ui registers; `ref` is what the action's trigger catches.
export const welcomeLayout: LayoutNode = {
  component: 'Page',
  children: [
    // This page's <head>. It draws nothing on the screen: `nisc export` writes
    // what it holds into the file's <head>, and in the page the head follows it.
    // A child's props are the element's attributes — any <meta>, any <link>.
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
      children: 'A nisc app with its own shell, drawn with plain DOM — no server. This screen is an action on a canvas; the page arrived drawn (nisc export wrote it), and the shell in this page picked it up.',
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
