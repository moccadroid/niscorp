import type { LayoutNode } from '@niscorp/nova';

export const mainSplitLayout: LayoutNode = {
  // `grow`, not `h: '100%'`: 100% would be the full 100vh and overflow below
  // the topbar. `shrink` lets content scroll inside and not scroll the page.
  component: 'Row',
  props: { grow: true, align: 'stretch', shrink: true },
  children: [
    {
      component: 'Box',
      props: { grow: true, h: '100%', shrink: true },
      children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
    },
    { component: 'Aside', children: { component: 'CanvasSlot', props: { canvasId: 'aside' } } },
  ],
};
