import type { LayoutNode } from '@niscorp/nova';

export const RENDERER_REF = 'renderer';

export const XRAY_REF = 'xray';

export const FRAME_STORE: Record<string, LayoutNode> = {
  [RENDERER_REF]: { component: 'Look', props: { look: 'dom' } },
  [XRAY_REF]: { component: 'Xray', props: { on: false } },
};

export const frameLayout: LayoutNode = {
  component: 'Page',
  children: [
    { ref: RENDERER_REF },
    { ref: XRAY_REF },
    // Over everything, when something is open; it takes no room in the stack.
    { component: 'CanvasSlot', props: { canvasId: 'overlay' } },
    { component: 'CanvasSlot', props: { canvasId: 'strip' } },
    { component: 'CanvasSlot', props: { canvasId: 'main' } },
  ],
};
