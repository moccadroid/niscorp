import type { LayoutNode } from '@niscorp/nova';

// The screen shown, and the dock under it, with the conversation in it.
export const frameLayout: LayoutNode = {
  component: 'Frame',
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'screen' } },
    { component: 'CanvasSlot', props: { canvasId: 'dock' } },
  ],
};
