import type { LayoutNode } from '@niscorp/nova';

// The frame every principal shares. Canvases stack; the last one with
// anything on it takes the rest of the screen. The speaker's slide tools sit
// ABOVE the controller, so the controller's own last row — Back and Next —
// stays at the bottom of the screen. Each is empty for anyone who
// has nothing on it — the strip is the stage's, the badge and desk are the
// assigned's, the tools the speaker's — and an empty canvas takes no room.
export const frameLayout: LayoutNode = {
  component: 'Page',
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'strip' } },
    { component: 'CanvasSlot', props: { canvasId: 'badge' } },
    { component: 'CanvasSlot', props: { canvasId: 'tools' } },
    { component: 'CanvasSlot', props: { canvasId: 'main' } },
    { component: 'CanvasSlot', props: { canvasId: 'desk' } },
  ],
};
