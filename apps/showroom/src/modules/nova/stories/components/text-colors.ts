import type { LayoutStory } from '../../story-types';

export const textColorsStory: LayoutStory = {
  id: 'text-colors',
  name: 'Text colors',
  description:
    "Demonstrates that prop values support template interpolation. Each Text reads its `color` prop from `{{$.colors.X}}` instead of a literal hex — proving you can theme components dynamically by writing colors into the data tree.",
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold', color: '{{$.colors.red}}' },
        children: 'Red',
      },
      {
        component: 'Text',
        props: { weight: 'bold', color: '{{$.colors.blue}}' },
        children: 'Blue',
      },
      {
        component: 'Text',
        props: { weight: 'bold', color: '{{$.colors.green}}' },
        children: 'Green',
      },
      {
        component: 'Text',
        props: { weight: 'bold', color: '{{$.colors.purple}}' },
        children: 'Purple',
      },
    ],
  },
  data: {
    colors: {
      red: '#dc2626',
      blue: '#2563eb',
      green: '#16a34a',
      purple: '#9333ea',
    },
  },
  expected: { textIncludes: ['Red', 'Blue', 'Green', 'Purple'] },
};
