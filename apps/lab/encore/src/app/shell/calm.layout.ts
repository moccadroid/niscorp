import type { LayoutNode } from '@niscorp/nova';
import { FLOW_ORDER } from '@encore/app/canvas-placement';

const flow: LayoutNode = {
  component: 'Pack',
  children: [{ component: 'CanvasSlot', props: { canvasId: 'attention' } }, ...FLOW_ORDER.map((canvasId): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } }))],
};

export const calmLayout: LayoutNode = flow;
