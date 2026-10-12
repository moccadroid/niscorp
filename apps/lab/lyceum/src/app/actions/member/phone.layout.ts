import type { LayoutNode } from '@niscorp/nova';

export const phoneLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['self', 'body'], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'self' }, children: [{ component: 'Label', children: '{{$.me.name}}' }] },
    { component: 'Cell', props: { area: 'body', pad: 'none', scroll: 'y' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'body' } }] },
  ],
};
