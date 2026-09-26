import type { LayoutNode } from '@niscorp/nova';

// The frame every principal shares. Canvases stack; the last one takes the
// rest of the screen. Each is empty for whoever holds nothing for it — the
// strip is the stage's, the house is the sorted's — and an empty canvas takes
// no room.
export const frameLayout: LayoutNode = {
  component: 'Page',
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'strip' } },
    { component: 'CanvasSlot', props: { canvasId: 'house' } },
    { component: 'CanvasSlot', props: { canvasId: 'main' } },
  ],
};
