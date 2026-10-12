import type { LayoutNode } from '@niscorp/nova';

export const frameLayout: LayoutNode = {
  component: 'Stack',
  props: { h: '100vh' },
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'chrome' } },
    {
      component: 'Box',
      props: { border: 'bottom', px: 20, py: 6 },
      children: { component: 'CanvasSlot', props: { canvasId: 'nav' } },
    },
    {
      // The stylesheet styles the `columns` and `aside` regions by name, on the
      // `data-assist` the dock's AssistState writes to the document root.
      component: 'Region',
      props: { name: 'columns' },
      children: {
        component: 'Row',
        props: { grow: true, shrink: true, align: 'stretch', wrap: true },
        children: [
          {
            component: 'Box',
            props: { grow: true, scroll: true, shrink: true, h: '100%' },
            children: [
              { component: 'CanvasSlot', props: { canvasId: 'main' } },
              { component: 'CanvasSlot', props: { canvasId: 'home' } },
              { component: 'CanvasSlot', props: { canvasId: 'work' } },
            ],
          },
          { component: 'CanvasSlot', props: { canvasId: 'detail' } },
          { component: 'Region', props: { name: 'aside' }, children: { component: 'CanvasSlot', props: { canvasId: 'aside' } } },
        ],
      },
    },
    { component: 'CanvasSlot', props: { canvasId: 'sheet' } },
    { component: 'CanvasSlot', props: { canvasId: 'assistant' } },
  ],
};
