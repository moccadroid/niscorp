import type { LayoutNode } from '@niscorp/nova';

// The shell FRAME — fixed, author-owned chrome. The topbar canvas sits over a
// scrolling content region holding the `main` canvas (centered by .fb-main);
// the `modal` canvas is an overlay layer that renders nothing until an action
// is pushed onto it.
export const frameLayout: LayoutNode = {
  component: 'Box',
  props: { h: '100vh' },
  children: [
    {
      component: 'Stack',
      props: { h: '100%', class: 'fb-min0' },
      children: [
        { component: 'CanvasSlot', props: { canvasId: 'topbar' } },
        {
          component: 'Box',
          props: { grow: true, scroll: true },
          children: {
            component: 'Box',
            props: { class: 'fb-main' },
            children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
          },
        },
      ],
    },
    { component: 'CanvasSlot', props: { canvasId: 'modal' } },
  ],
};
