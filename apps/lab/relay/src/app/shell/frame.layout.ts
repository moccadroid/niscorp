import type { LayoutNode } from '@niscorp/nova';
import { mainSplitLayout } from './main-split.layout';

export const frameLayout: LayoutNode = {
  component: 'Box',
  props: { h: '100vh' },
  children: [
    {
      component: 'Row',
      props: { h: '100%', align: 'stretch' },
      children: [
        { component: 'CanvasSlot', props: { canvasId: 'sidebar' } },
        {
          component: 'Stack',
          // `shrink` lets `main` take only the height the topbar leaves, so
          // content scrolls inside it and the column does not overflow 100vh.
          props: { grow: true, h: '100%', shrink: true },
          children: [
            { component: 'CanvasSlot', props: { canvasId: 'topbar' } },
            mainSplitLayout,
          ],
        },
      ],
    },
    { component: 'CanvasSlot', props: { canvasId: 'modal' } },
    { component: 'DevtoolsAnchor', children: { component: 'CanvasSlot', props: { canvasId: 'devtools' } } },
  ],
};
