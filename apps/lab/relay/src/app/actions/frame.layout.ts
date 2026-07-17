import type { LayoutNode } from '@niscorp/nova';
import { mainSplitLayout } from './main-split.layout';

// The shell FRAME — fixed, author-owned chrome, served to terminals as
// data: the whole canvas arrangement, CanvasSlots in real containers.
// (Hot-swappable `{ ref }` regions exist in nova for LLM-chosen layouts;
// nothing here swaps, so nothing here is a ref.)
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
          // `shrink` lets the `main` region below shrink to the space LEFT by
          // the fixed topbar — so content scrolls inside `main` instead of the
          // whole column overflowing 100vh and scrolling the topbar off-screen.
          props: { grow: true, h: '100%', shrink: true },
          children: [
            { component: 'CanvasSlot', props: { canvasId: 'topbar' } },
            mainSplitLayout,
          ],
        },
      ],
    },
    { component: 'CanvasSlot', props: { canvasId: 'modal' } },
  ],
};
