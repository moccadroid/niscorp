import type { LayoutNode } from '@niscorp/nova';

const region = (area: string): LayoutNode => ({
  component: 'Cell',
  props: { area, pad: 'none' },
  children: [{ component: 'CanvasSlot', props: { canvasId: area } }],
});

export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  // On a phone the controller is a remote: the notes stay on the computer, and
  // the slide's tools get the whole middle.
  props: {
    size: 'fill',
    areas: ['head head', 'tools notes', 'attached notes', 'controls controls'],
    rows: ['auto', 3, 1, 'auto'],
    narrow: { areas: ['head', 'tools', 'attached', 'controls'], rows: ['auto', 1, 'auto', 'auto'] },
  },
  children: [region('head'), region('tools'), region('notes'), region('attached'), region('controls')],
};
