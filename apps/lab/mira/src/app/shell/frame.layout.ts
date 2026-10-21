import type { LayoutNode } from '@niscorp/nova';

// The answer, and the dock under it. The answer is a region: each answer swaps in the arrangement it is laid out in
// (src/app/arrangements.ts).
export const frameLayout: LayoutNode = {
  component: 'Frame',
  children: [{ ref: 'answers' }, { component: 'CanvasSlot', props: { canvasId: 'dock' } }],
};
