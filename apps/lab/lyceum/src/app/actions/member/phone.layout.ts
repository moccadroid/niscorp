import type { LayoutNode } from '@niscorp/nova';

// THE PHONE'S ARRANGEMENT — four canvases, nothing else (the controller's
// pattern, speaker/console.layout.ts). Who you are across the top, always;
// under it whatever the speaker has given you (the X-ray) — empty, it takes no
// room; one thing at a time in the body, which scrolls inside itself; the tabs
// where the thumb is. Nothing on the phone scrolls away but the body.
export const phoneLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['self', 'given', 'body', 'tabs'], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'self', pad: 'none' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'self' } }] },
    { component: 'Cell', props: { area: 'given', pad: 'none' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'given' } }] },
    { component: 'Cell', props: { area: 'body', pad: 'none', scroll: 'y' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'body' } }] },
    { component: 'Cell', props: { area: 'tabs', pad: 'none' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'tabs' } }] },
  ],
};
