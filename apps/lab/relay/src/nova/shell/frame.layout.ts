import type { LayoutNode } from '@niscorp/nova';

// The shell FRAME — fixed, author-owned chrome. It places the sidebar and
// topbar with real CanvasSlots, and leaves the dynamic regions behind
// LayoutRefs: `main` (the content area) and `modal` (an overlay layer). The
// targets of those refs live in the layout store and can be hot-swapped
// (shell.setLayout) without ever touching this frame — so a swap can't remove
// the chrome, it isn't reachable from the ref.
export const frameLayout: LayoutNode = {
  component: 'Box',
  props: { h: '100vh' },
  children: [
    {
      component: 'Row',
      props: { h: '100%', align: 'stretch' },
      children: [
        { component: 'CanvasSlot', props: { canvasId: 'sidebar' } },
        {
          component: 'Stack',
          // `shrink` lets the `main` region below shrink to the space LEFT by
          // the fixed topbar — so content scrolls inside `main` instead of the
          // whole column overflowing 100vh and scrolling the topbar off-screen.
          // (A wide board also scrolls horizontally for the same reason.)
          props: { grow: true, h: '100%', shrink: true },
          children: [
            { component: 'CanvasSlot', props: { canvasId: 'topbar' } },
            { ref: 'main' },
          ],
        },
      ],
    },
    { ref: 'modal' },
  ],
};
