import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// A static layout showing the four main Box props: bare padding,
// padding + background + radius, padding + border, and a dark
// filled variant with light text.

const layout: LayoutNode = {
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
      children: {
        component: 'Text',
        props: { color: '#f1f5f9', weight: 'bold' },
        children: 'Dark Box with light text.',
      },
    },
  ],
};

export { layout };

export const Demo = () => <Nova.Layout layout={layout} />;
