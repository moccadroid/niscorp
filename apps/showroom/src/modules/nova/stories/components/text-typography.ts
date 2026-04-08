import type { LayoutStory } from '../../story-types';
import type { LayoutNode } from '@niscorp/nova';

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const WEIGHTS = ['normal', 'medium', 'bold'] as const;
const AS_VALUES = ['p', 'span', 'h1', 'h2', 'h3', 'h4'] as const;

const sizeWeightRows: LayoutNode[] = SIZES.map(
  (size): LayoutNode => ({
    component: 'Stack',
    props: { direction: 'row', gap: 16, align: 'center' },
    children: WEIGHTS.map(
      (weight): LayoutNode => ({
        component: 'Text',
        props: { size, weight },
        children: `size=${size} weight=${weight}`,
      }),
    ),
  }),
);

const asRows: LayoutNode[] = AS_VALUES.map(
  (as): LayoutNode => ({
    component: 'Text',
    props: { as },
    children: `Rendered as <${as}>`,
  }),
);

export const textTypographyStory: LayoutStory = {
  id: 'text-typography',
  name: 'Text typography',
  description:
    'Every size \u00d7 weight combination, plus every supported `as` value.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      ...sizeWeightRows,
      {
        component: 'Box',
        props: { padding: 0, radius: 0 },
        children: {
          component: 'Stack',
          props: { direction: 'column', gap: 6 },
          children: asRows,
        },
      },
    ],
  },
  data: {},
  expected: {
    componentCount: 29,
    textNodeCount: 21,
    textIncludes: ['size=md weight=bold', 'Rendered as <h1>'],
  },
};
