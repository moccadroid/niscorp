import type { LayoutNode } from '@niscorp/nova';

// The frame around the canvases — chrome lives here, as layout, never as a
// wrapper component. One canvas for now: `main`, drawn where its slot is.
export const frameLayout: LayoutNode = { component: 'CanvasSlot', props: { canvasId: 'main' } };
