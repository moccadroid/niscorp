import type { LayoutNode } from '@niscorp/nova';

// The Home dashboard: three KPI tiles over a pipeline-by-stage table. All
// values are pre-formatted strings written by the `loadHome` function, so the
// layout only binds and displays. Literal + serializable.
export const homeLayout: LayoutNode = {
  if: '$.loading',
  then: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      {
        component: 'Grid',
        props: { columns: 3, gap: 14 },
        children: {
          for: [1, 1, 1],
          as: 's',
          do: {
            component: 'Box',
            props: { bg: 'surface', border: true, radius: 13, pad: 17 },
            children: { component: 'Stack', props: { gap: 12 }, children: [{ component: 'Skeleton', props: { width: '55%' } }, { component: 'Skeleton', props: { width: '40%', height: 26 } }] },
          },
        },
      },
      { component: 'Box', props: { bg: 'surface', border: true, radius: 13, pad: 18 }, children: { component: 'Skeleton', props: { height: 140 } } },
    ],
  },
  else: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      {
        component: 'Grid',
        props: { columns: 3, gap: 14 },
        children: [
          {
            component: 'Box',
            props: { bg: 'surface', border: true, radius: 13, pad: 17 },
            children: {
              component: 'Stack',
              props: { gap: 9 },
              children: [
                { component: 'Row', props: { gap: 8 }, children: [{ component: 'Icon', props: { name: 'dollar', size: 15 } }, { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'Open pipeline' }] },
                { component: 'Text', props: { size: '2xl', weight: 680 }, children: '$.dash.open.value' },
              ],
            },
          },
          {
            component: 'Box',
            props: { bg: 'surface', border: true, radius: 13, pad: 17 },
            children: {
              component: 'Stack',
              props: { gap: 9 },
              children: [
                { component: 'Row', props: { gap: 8 }, children: [{ component: 'Icon', props: { name: 'trending-up', size: 15 } }, { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'Won' }] },
                { component: 'Text', props: { size: '2xl', weight: 680 }, children: '$.dash.won.value' },
              ],
            },
          },
          {
            component: 'Box',
            props: { bg: 'surface', border: true, radius: 13, pad: 17 },
            children: {
              component: 'Stack',
              props: { gap: 9 },
              children: [
                { component: 'Row', props: { gap: 8 }, children: [{ component: 'Icon', props: { name: 'check-square', size: 15 } }, { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'Open tasks' }] },
                { component: 'Text', props: { size: '2xl', weight: 680 }, children: '$.dash.tasks.count' },
              ],
            },
          },
        ],
      },
      {
        component: 'Box',
        props: { bg: 'surface', border: true, radius: 13 },
        children: [
          { component: 'Box', props: { px: 18, py: 14, border: 'bottom' }, children: { component: 'Text', props: { weight: 600 }, children: 'Pipeline by stage' } },
          {
            component: 'Grid',
            props: { template: '2fr 1fr 1fr', align: 'center', border: 'bottom' },
            children: [
              { component: 'Box', props: { px: 18, py: 11 }, children: { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Stage' } },
              { component: 'Box', props: { px: 18, py: 11 }, children: { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Deals' } },
              { component: 'Box', props: { px: 18, py: 11 }, children: { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Value' } },
            ],
          },
          {
            for: '$.dash.stages',
            as: 's',
            key: 'name',
            do: {
              component: 'Grid',
              props: { template: '2fr 1fr 1fr', align: 'center', hover: true, border: 'bottom' },
              children: [
                { component: 'Box', props: { px: 18, py: 12 }, children: { component: 'Text', props: { weight: 500 }, children: '$.s.name' } },
                { component: 'Box', props: { px: 18, py: 12 }, children: { component: 'Text', props: { color: 'secondary' }, children: '$.s.count' } },
                { component: 'Box', props: { px: 18, py: 12 }, children: { component: 'Text', props: { weight: 540 }, children: '$.s.value' } },
              ],
            },
          },
        ],
      },
    ],
  },
};
