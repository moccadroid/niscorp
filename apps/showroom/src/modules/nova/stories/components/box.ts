import type { LayoutStory } from '../../story-types';

export const boxStory: LayoutStory = {
  id: 'box',
  name: 'Box',
  description:
    'Demonstrates the Box styling primitive across its main props: bare padding only, padding with background and radius, padding with a border, and a dark filled variant with light text. Useful as a quick visual reference for combining Box props.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        component: 'Box',
        props: { padding: 16 },
        children: { component: 'Text', children: 'Bare Box, padding 16.' },
      },
      {
        component: 'Box',
        props: { padding: 24, background: '#eef2ff', radius: 8 },
        children: { component: 'Text', children: 'Box with background and radius.' },
      },
      {
        component: 'Box',
        props: { padding: 16, border: true, radius: 4 },
        children: { component: 'Text', children: 'Box with a border.' },
      },
      {
        component: 'Box',
        props: { padding: 32, background: '#1e293b', radius: 12 },
        children: { component: 'Text', props: { color: '#f1f5f9', weight: 'bold' }, children: 'Dark Box with light text.' },
      },
    ],
  },
  data: {},
  expected: {
    componentCount: 9,
    textNodeCount: 4,
    textIncludes: [
      'Bare Box, padding 16.',
      'Box with background and radius.',
      'Box with a border.',
      'Dark Box with light text.',
    ],
  },
};
