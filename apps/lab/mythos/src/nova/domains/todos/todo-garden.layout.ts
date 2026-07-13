import type { LayoutNode } from '@niscorp/nova';

// One plot. Blooms replant on click; sprouts (and wilters) bloom on click.
const plot: LayoutNode = {
  component: 'Card',
  props: { tone: 'ghost', pad: 10 },
  children: [
    {
      component: 'Stack',
      props: { align: 'center', gap: 4 },
      children: [
        {
          if: '$plot.is_bloom',
          then: {
            component: 'Doodle',
            ref: 'plot-bloom',
            props: { kind: '$plot.bloom', stage: '$plot.stage', size: 'lg', payload: '$plot.todo_id', title: 'replant it' },
          },
          else: {
            component: 'Doodle',
            ref: 'plot-sprout',
            props: { kind: '$plot.bloom', stage: '$plot.stage', size: 'lg', payload: '$plot.todo_id', title: 'bloom it' },
          },
        },
        { component: 'Text', props: { size: 'sm', weight: 'medium', align: 'center' }, children: '{{$plot.title}}' },
        { component: 'Text', props: { size: 'xs', tone: 'sub', align: 'center' }, children: '{{$plot.when_display}}' },
      ],
    },
  ],
};

const emptyGarden: LayoutNode = {
  component: 'Stack',
  props: { align: 'center', gap: 10, padding: 40 },
  children: [
    { component: 'Doodle', props: { kind: 'fern', stage: 'sprout', size: 'lg' } },
    { component: 'Text', props: { size: 'lg', weight: 'medium' }, children: 'Nothing planted yet.' },
    { component: 'Text', props: { size: 'sm', tone: 'sub' }, children: 'Plant a todo and it sprouts right here.' },
  ],
};

export const todoGardenLayout: LayoutNode = {
  component: 'Surface',
  props: { mood: '$.stats.mood', fill: true },
  children: [
    {
      component: 'Stack',
      props: { gap: 14, padding: 22, maxWidth: 860 },
      children: [
        {
          component: 'Stack',
          props: { direction: 'row', gap: 10, align: 'center' },
          children: [
            { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'The Garden' },
            { component: 'Chip', props: { label: '{{$.garden.length}} plots', tone: 'soft' } },
          ],
        },
        {
          component: 'Text',
          props: { size: 'sm', tone: 'sub' },
          children: 'Every todo lives here: sprouts are open, wilting ones are overdue, blooms are done. Tap a sprout to bloom it — tap a bloom to replant it.',
        },
        {
          if: '$.loading',
          then: { component: 'Text', props: { tone: 'sub' }, children: 'raking…' },
          else: {
            if: '$.garden.length',
            then: {
              component: 'Stack',
              props: { direction: 'row', wrap: true, gap: 12 },
              children: [{ for: '$.garden', as: 'plot', key: 'todo_id', do: plot }],
            },
            else: emptyGarden,
          },
        },
        { component: 'Confetti', props: { spark: '$.spark' } },
      ],
    },
  ],
};
