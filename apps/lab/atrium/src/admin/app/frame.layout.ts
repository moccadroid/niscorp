import type { LayoutNode } from '@niscorp/nova';

// The whole frame: one canvas.
//
// This tool has no chrome to arrange, because it is not a page — it is a dock
// floating over somebody else's application, and the dock is drawn by the
// actions themselves (each one renders its own `Dock`, collapsed or open). The
// canvas is a STACK, so the section you opened covers the pill, and popping
// gets you back to it: navigation is the stack, and there is no nav bar to keep
// in step with it.
export const adminFrame: LayoutNode = { component: 'CanvasSlot', props: { canvasId: 'admin' } };
