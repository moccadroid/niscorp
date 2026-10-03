import type { LayoutNode } from '@niscorp/nova';

// JSON, bound to the action's data. Every component name is one the kit in
// src/ui registers; `ref` is what the action's trigger catches.
export const welcomeLayout: LayoutNode = {
  component: 'Page',
  children: [
    { component: 'Heading', children: '{{$.name}}' },
    {
      component: 'Text',
      props: { tone: 'muted' },
      children: 'A nisc app behind moss. This screen is an action on a canvas, served from a shell on the server; the page arrived drawn, and the browser picked it up. Nobody is signed in, so this shell lasts as long as your connection — reload, and the count starts again.',
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
