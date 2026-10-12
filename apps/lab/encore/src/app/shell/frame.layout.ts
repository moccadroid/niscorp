import type { LayoutNode } from '@niscorp/nova';

export const ROOM_REF = 'room';

export const frameLayout: LayoutNode = {
  component: 'Box',
  props: { tone: 'ground', minH: '100vh', px: 18, py: 12 },
  children: [
    {
      component: 'Stack',
      props: { gap: 12, minH: 'calc(100vh - 24px)' },
      children: [
        { component: 'Box', props: { stick: 'top' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'line' } }] },
        { component: 'CanvasSlot', props: { canvasId: 'assist' } },
        { component: 'CanvasSlot', props: { canvasId: 'maybe' } },
        { component: 'CanvasSlot', props: { canvasId: 'watch' } },
        { ref: ROOM_REF },
        { component: 'CanvasSlot', props: { canvasId: 'rail' } },
        { component: 'Box', props: { stick: 'bottom' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'trace' } }] },
      ],
    },
  ],
};
