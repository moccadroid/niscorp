import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// Prop values go through template interpolation — so `color` can
// read from data instead of being a literal. Swap the data tree
// to theme every Text without touching the layout.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.red}}' }, children: 'Red' },
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.blue}}' }, children: 'Blue' },
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.green}}' }, children: 'Green' },
    { component: 'Text', props: { weight: 'bold', color: '{{$.colors.purple}}' }, children: 'Purple' },
  ],
};

const data = {
  colors: {
    red: '#dc2626',
    blue: '#2563eb',
    green: '#16a34a',
    purple: '#9333ea',
  },
};

export { layout, data };

export const Demo = () => <Nova.Layout layout={layout} data={data} />;
