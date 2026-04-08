import type { LayoutStory } from '../../story-types';

export const textStory: LayoutStory = {
  id: 'text',
  name: 'Text',
  description:
    'Typography component. This story shows several Text variants stacked vertically — different `as`, `size`, and `weight` combinations.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { as: 'h1', size: '2xl', weight: 'bold' }, children: 'Heading h1, 2xl, bold' },
      { component: 'Text', props: { as: 'h2', size: 'xl', weight: 'bold' }, children: 'Heading h2, xl, bold' },
      { component: 'Text', props: { as: 'p', size: 'md' }, children: 'Body p, md, normal — the default reading size for paragraphs.' },
      { component: 'Text', props: { as: 'span', size: 'sm', weight: 'medium' }, children: 'Span sm, medium — inline accent text.' },
      { component: 'Text', props: { size: 'lg', weight: 'bold', color: '#dc2626' }, children: 'Large bold red text via the open color prop.' },
    ],
  },
  data: {},
  expected: {
    componentCount: 6,
    textNodeCount: 5,
    textIncludes: [
      'Heading h1, 2xl, bold',
      'Heading h2, xl, bold',
      'Body p, md, normal',
      'Span sm, medium',
      'Large bold red text',
    ],
  },
};
