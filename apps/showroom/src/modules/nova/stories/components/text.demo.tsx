import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// A few Text variants: different `as`, `size`, `weight`, `color`.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    {
      component: 'Text',
      props: { as: 'h1', size: '2xl', weight: 'bold' },
      children: 'Heading h1, 2xl, bold',
    },
    {
      component: 'Text',
      props: { as: 'h2', size: 'xl', weight: 'bold' },
      children: 'Heading h2, xl, bold',
    },
    {
      component: 'Text',
      props: { as: 'p', size: 'md' },
      children: 'Body p, md, normal — the default reading size for paragraphs.',
    },
    {
      component: 'Text',
      props: { as: 'span', size: 'sm', weight: 'medium' },
      children: 'Span sm, medium — inline accent text.',
    },
    {
      component: 'Text',
      props: { size: 'lg', weight: 'bold', color: '#dc2626' },
      children: 'Large bold red text via the open color prop.',
    },
  ],
};

export { layout };

export const Demo = () => <Nova.Layout layout={layout} />;
