import type { LayoutNode } from '@niscorp/nova';
import { AREAS } from './areas';

export const frameLayout: LayoutNode = {
  component: 'Frame',
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'bar' } },
    { component: 'Answers', children: AREAS.map((area) => ({ component: 'Area', props: { name: area }, children: [{ component: 'CanvasSlot', props: { canvasId: area } }] })) },
    { component: 'CanvasSlot', props: { canvasId: 'line' } },
  ],
};
