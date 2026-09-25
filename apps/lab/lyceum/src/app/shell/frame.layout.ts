import type { LayoutNode } from '@niscorp/nova';

export const frameLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 0 },
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'house' } },
    { component: 'CanvasSlot', props: { canvasId: 'main' } },
  ],
};
