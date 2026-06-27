import type { LayoutNode } from '@niscorp/nova';

// The default `main` region layout — the target of the `main` LayoutRef in the
// frame. The active screen fills the left; the `aside` canvas sits on
// the right. The aside's SIZE is owned by the shell here (the `.rl-aside` class:
// width + left border), and `.rl-aside:empty` collapses it when nothing is
// loaded — so the actions that load there stay responsive and fill whatever the
// canvas gives them. Swappable via shell.setLayout('main', …) without touching
// the sidebar/topbar (those are in the frame, not here).
export const mainSplitLayout: LayoutNode = {
  // `grow` (flex:1) fills the height the topbar LEFT — not `h:100%`, which would
  // be the full 100vh and overflow. `rl-min0` lets it (and the scroll Box) shrink
  // so content scrolls inside instead of scrolling the whole page.
  component: 'Row',
  props: { grow: true, align: 'stretch', class: 'rl-min0' },
  children: [
    {
      // The main canvas's own actionLayout (stack nav) provides the scroll + the
      // 20px content padding, so this region just sizes the column.
      component: 'Box',
      props: { grow: true, h: '100%', class: 'rl-min0' },
      children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
    },
    { component: 'Box', props: { class: 'rl-aside' }, children: { component: 'CanvasSlot', props: { canvasId: 'aside' } } },
  ],
};
