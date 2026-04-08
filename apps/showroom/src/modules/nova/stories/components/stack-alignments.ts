import type { LayoutStory } from '../../story-types';
import type { LayoutNode } from '@niscorp/nova';

const ALIGN_VALUES = ['start', 'center', 'end'] as const;
const JUSTIFY_VALUES = ['start', 'center', 'end', 'between'] as const;

const swatch = (label: string): LayoutNode => ({
  component: 'Box',
  props: { padding: 8, background: '#dbeafe', radius: 4 },
  children: { component: 'Text', props: { size: 'sm' }, children: label },
});

const buildRow = (align: (typeof ALIGN_VALUES)[number]): LayoutNode => ({
  component: 'Stack',
  props: { direction: 'column', gap: 6 },
  children: [
    {
      component: 'Text',
      props: { size: 'sm', weight: 'bold' },
      children: `align=${align}`,
    },
    {
      component: 'Stack',
      props: { direction: 'row', gap: 12 },
      children: JUSTIFY_VALUES.map(
        (justify): LayoutNode => ({
          component: 'Box',
          props: { padding: 8, border: true, radius: 4 },
          children: {
            component: 'Stack',
            props: { direction: 'row', gap: 6, align, justify },
            children: [swatch('A'), swatch('B'), swatch('C')],
          },
        }),
      ),
    },
  ],
});

export const stackAlignmentsStory: LayoutStory = {
  id: 'stack-alignments',
  name: 'Stack alignments',
  description:
    'A grid covering every align \u00d7 justify combination on a row Stack.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: ALIGN_VALUES.map((a) => buildRow(a)),
  },
  data: {},
  expected: {
    componentCount: 106,
    textNodeCount: 39,
    textIncludes: ['align=start', 'align=center', 'align=end', 'A', 'B', 'C'],
  },
};
