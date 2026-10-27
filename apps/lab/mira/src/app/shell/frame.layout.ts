import type { LayoutNode } from '@niscorp/nova';

export const frameLayout: LayoutNode = {
  component: 'Frame',
  children: [{ ref: 'answers' }, { component: 'CanvasSlot', props: { canvasId: 'overview' } }, { component: 'CanvasSlot', props: { canvasId: 'dock' } }],
};
