import type { LayoutNode } from '@niscorp/nova';

export const frameLayout: LayoutNode = {
  component: 'Stack',
  props: { h: '100%', bg: 'ground' },
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'chrome' } },

    {
      component: 'Box',
      props: { grow: true, scroll: true },
      children: {
        component: 'Box',
        props: { px: 24, py: 28, maxWidth: 1040, center: true },
        children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
      },
    },

    { component: 'CanvasSlot', props: { canvasId: 'sheet' } },
  ],
};
