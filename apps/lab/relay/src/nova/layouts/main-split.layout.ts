import type { LayoutNode } from '@niscorp/nova';

// The default `main` region layout — the target of the `main` LayoutRef in the
// frame. The active screen fills the left; the `detail` canvas sits on the
// right. The detail pane is a BARE CanvasSlot (content-sized), so an empty
// `detail` canvas renders nothing and the panel collapses — the panel chrome
// (width / left border) lives in the contact-detail layout, present only when a
// detail action is. Swappable via shell.setLayout('main', …) without touching
// the sidebar/topbar (those are in the frame, not here).
export const mainSplitLayout: LayoutNode = {
  // `grow` (flex:1) fills the height the topbar LEFT — not `h:100%`, which would
  // be the full 100vh and overflow. `rl-min0` lets it (and the scroll Box) shrink
  // so content scrolls inside instead of scrolling the whole page.
  component: 'Row',
  props: { grow: true, align: 'stretch', class: 'rl-min0' },
  children: [
    {
      component: 'Box',
      props: { grow: true, h: '100%', scroll: true, pad: 26, class: 'rl-min0' },
      children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
    },
    { component: 'CanvasSlot', props: { canvasId: 'detail' } },
  ],
};
