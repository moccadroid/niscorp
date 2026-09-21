import type { LayoutNode } from '@niscorp/nova';

// THE FRAME. The fixed things — the line on top with the slow path's card and
// the chips beneath it, the instrument underneath —
// and between them a `{ ref }`, not a layout. The room's arrangement lives in
// the shell's layout store under `room`, so a later slice re-arranges the whole
// screen with one `shell.setLayout('room', …)` and the line the operator is
// typing into is never unmounted by it.
export const ROOM_REF = 'room';

// ONE SCROLLBAR, AND IT IS THE PAGE'S. The frame is a document that grows: no
// fixed height, no inner scrolling region. The line sticks to the top of the page
// as it scrolls, the two tiny handles (and, under x-ray, the drawer) to the
// bottom; neither is a scroll container.
//
// Top to bottom with no empty bands: the x-ray marker (nothing, when off), the
// line, the answer, one row of next steps, what the room noticed, THE FLOW, and
// a one-line history.
export const frameLayout: LayoutNode = {
  component: 'Box',
  props: { tone: 'ground', minH: '100vh', px: 18, py: 12 },
  children: [
    {
      component: 'Stack',
      // As tall as the window at least, so the handles rest at its bottom edge
      // when the room is short; taller, and the PAGE scrolls.
      props: { gap: 12, minH: 'calc(100vh - 24px)' },
      children: [
        { component: 'Box', props: { stick: 'top' }, children: [{ component: 'Stack', props: { gap: 8 }, children: [{ component: 'CanvasSlot', props: { canvasId: 'marker' } }, { component: 'CanvasSlot', props: { canvasId: 'line' } }] }] },
        { component: 'CanvasSlot', props: { canvasId: 'assist' } },
        { component: 'CanvasSlot', props: { canvasId: 'maybe' } },
        { component: 'CanvasSlot', props: { canvasId: 'watch' } },
        { ref: ROOM_REF },
        { component: 'CanvasSlot', props: { canvasId: 'rail' } },
        {
          component: 'Box',
          props: { stick: 'bottom' },
          children: [
            {
              component: 'Stack',
              props: { gap: 6 },
              children: [
                { component: 'CanvasSlot', props: { canvasId: 'trace' } },
                { component: 'Row', props: { gap: 10, align: 'center', justify: 'end', wrap: true }, children: [{ component: 'CanvasSlot', props: { canvasId: 'deck' } }, { component: 'CanvasSlot', props: { canvasId: 'xray' } }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};
