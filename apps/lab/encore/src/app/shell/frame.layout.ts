import type { LayoutNode } from '@niscorp/nova';

// THE FRAME. The fixed things — the line on top with the slow path's card and
// the chips beneath it, the instrument underneath —
// and between them a `{ ref }`, not a layout. The room's arrangement lives in
// the shell's layout store under `room`, so a later slice re-arranges the whole
// screen with one `shell.setLayout('room', …)` and the line the operator is
// typing into is never unmounted by it.
export const ROOM_REF = 'room';

export const frameLayout: LayoutNode = {
  component: 'Box',
  props: { tone: 'ground', h: '100vh', pad: 18 },
  children: [
    {
      component: 'Stack',
      props: { gap: 14, h: '100%' },
      children: [
        // THE LINE STAYS PUT — it is the hero, and the one thing that must never
        // scroll away. Everything it produces scrolls under it, as one column: an
        // evening that raised four cards used to push the room, and the drawer,
        // off the bottom of the window.
        { component: 'CanvasSlot', props: { canvasId: 'line' } },
        {
          component: 'Box',
          props: { grow: true, scroll: true },
          children: [
            {
              component: 'Stack',
              props: { gap: 14 },
              children: [
                // Directly under the line: what the second, slower model is doing
                // about the sentence belongs next to the sentence.
                { component: 'CanvasSlot', props: { canvasId: 'assist' } },
                // Then the rail: earlier turns, a line each, newest nearest the line.
                { component: 'CanvasSlot', props: { canvasId: 'rail' } },
                { component: 'CanvasSlot', props: { canvasId: 'maybe' } },
                // What the room noticed by itself: the strip, then what it raised.
                { component: 'CanvasSlot', props: { canvasId: 'watch' } },
                { component: 'CanvasSlot', props: { canvasId: 'attention' } },
                { ref: ROOM_REF },
              ],
            },
          ],
        },
        // THE DRAWER, docked at the bottom: the trace, then one row holding the
        // director and the x-ray switch. With x-ray off the first is an empty tree
        // and the row is two tiny handles, bottom right.
        { component: 'CanvasSlot', props: { canvasId: 'trace' } },
        {
          component: 'Row',
          props: { gap: 10, align: 'center', justify: 'end', wrap: true },
          children: [
            { component: 'CanvasSlot', props: { canvasId: 'deck' } },
            { component: 'CanvasSlot', props: { canvasId: 'xray' } },
          ],
        },
      ],
    },
  ],
};
