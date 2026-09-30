import type { LayoutNode } from '@niscorp/nova';

// THE PHONE'S ARRANGEMENT: the name they chose across the top, always; under
// it the LIST of what this phone holds (the `body` list canvas), one action
// under another, scrolling inside itself. Nothing on the phone scrolls away but
// the list.
export const phoneLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['self', 'body'], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'self' }, children: [{ component: 'Label', children: '{{$.me.name}}' }] },
    { component: 'Cell', props: { area: 'body', pad: 'none', scroll: 'y' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'body' } }] },
  ],
};
