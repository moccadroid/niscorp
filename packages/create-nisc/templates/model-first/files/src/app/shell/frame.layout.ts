import type { LayoutNode } from '@niscorp/nova';

// The bar, the answer, the line to ask in. The answer is a region: each answer swaps in the arrangement it is laid out
// in (src/app/arrangements.ts).
export const frameLayout: LayoutNode = {
  component: 'Frame',
  children: [{ component: 'CanvasSlot', props: { canvasId: 'bar' } }, { ref: 'answers' }, { component: 'CanvasSlot', props: { canvasId: 'line' } }],
};
