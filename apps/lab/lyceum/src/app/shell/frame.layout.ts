import type { LayoutNode } from '@niscorp/nova';

// The frame every principal shares. Canvases stack; the last one with
// anything on it takes the rest of the screen. Each is empty for anyone who
// has nothing on it — the strip is the stage's, the badge and desk are the
// assigned's — and an empty canvas takes no room. The speaker's controller is
// one action on `main` whose own layout arranges its four canvases
// (speaker/console.layout.ts); none of them is here.
export const frameLayout: LayoutNode = {
  component: 'Page',
  children: [
    // Over everything, when something is open; it takes no room in the stack.
    { component: 'CanvasSlot', props: { canvasId: 'overlay' } },
    { component: 'CanvasSlot', props: { canvasId: 'strip' } },
    { component: 'CanvasSlot', props: { canvasId: 'badge' } },
    { component: 'CanvasSlot', props: { canvasId: 'main' } },
    { component: 'CanvasSlot', props: { canvasId: 'desk' } },
  ],
};
