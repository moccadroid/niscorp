import { createShell } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ShellStory } from '../../story-types';

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
    {
      event: 'ui:click',
      ref: 'go-a',
      do: [{ replace: { action: 'articleA', canvas: 'content' } }],
    },
    {
      event: 'ui:click',
      ref: 'go-b',
      do: [{ replace: { action: 'articleB', canvas: 'content' } }],
    },
    {
      event: 'ui:click',
      ref: 'go-c',
      do: [{ replace: { action: 'articleC', canvas: 'content' } }],
    },
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

export const multiCanvasStory: ShellStory = {
  id: 'multi-canvas',
  name: 'Multi-canvas navigation',
  description:
    'A nav canvas drives a separate content canvas. Each button on the nav replaces the top action on the content canvas using an explicit canvas target in the replace effect.',
  kind: 'shell',
  category: 'Multi-canvas',
  shellSetup: ({ registry, layoutStore }) =>
    createShell({
      canvases: ['nav', 'content'],
      registry,
      layoutStore,
      actions: { navigator, welcome, articleA, articleB, articleC },
      onError: (err) => {
        console.error(err);
      },
    }),
  initialPushes: [
    { canvas: 'nav', actionId: 'navigator' },
    { canvas: 'content', actionId: 'welcome' },
  ],
  canvases: ['nav', 'content'],
  expected: { textIncludes: ['Article A', 'Article B', 'Article C', 'Welcome'] },
};
