import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// Two canvases side by side. The nav canvas drives the content
// canvas: each button fires a `replace` targeted at `content`,
// which swaps the top action there without touching `nav`.

const navigator: ActionDefinition = {
  id: 'navigator',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Navigator' },
      { component: 'Button', ref: 'go-a', children: 'Article A' },
      {
        component: 'Button',
        ref: 'go-b',
        props: { variant: 'secondary' },
        children: 'Article B',
      },
      {
        component: 'Button',
        ref: 'go-c',
        props: { variant: 'ghost' },
        children: 'Article C',
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'go-a', do: [{ replace: { action: 'articleA', canvas: 'content' } }] },
    { event: 'ui:click', ref: 'go-b', do: [{ replace: { action: 'articleB', canvas: 'content' } }] },
    { event: 'ui:click', ref: 'go-c', do: [{ replace: { action: 'articleC', canvas: 'content' } }] },
  ],
};

const welcome: ActionDefinition = {
  id: 'welcome',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Welcome' },
      { component: 'Text', children: 'Pick an article from the nav.' },
    ],
  },
};

const buildArticle = (id: string, title: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: title },
      {
        component: 'Text',
        children:
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      },
    ],
  },
});

const articleA = buildArticle('articleA', 'Article A');
const articleB = buildArticle('articleB', 'Article B');
const articleC = buildArticle('articleC', 'Article C');

const shell = createShell({
  canvases: [
    { id: 'nav', initial: 'navigator' },
    { id: 'content', initial: 'welcome' },
  ],
  actions: { navigator, welcome, articleA, articleB, articleC },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
