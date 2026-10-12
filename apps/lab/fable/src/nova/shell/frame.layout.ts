import type { LayoutNode } from '@niscorp/nova';

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
