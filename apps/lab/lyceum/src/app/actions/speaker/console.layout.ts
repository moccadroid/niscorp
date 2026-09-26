import type { LayoutNode } from '@niscorp/nova';

// THE CONTROLLER'S ARRANGEMENT — four canvases, nothing else. What stays the
// same stays where it is: the head at the top, Back and Next at the bottom. The
// middle is the slide on screen: its tool on the left, its notes on the right.
// Each region is its own canvas holding its own action, so a slide bringing a
// tool, or none, changes what is IN the left region and moves nothing.
const region = (area: string): LayoutNode => ({
  component: 'Cell',
  props: { area, pad: 'none' },
  children: [{ component: 'CanvasSlot', props: { canvasId: area } }],
});

export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  // On a phone the controller is a remote, not a lectern: the notes stay on the
  // computer, and the slide's tools get the whole middle.
  props: {
    size: 'fill',
    areas: ['head head', 'tools notes', 'controls controls'],
    rows: ['auto', 1, 'auto'],
    narrow: { areas: ['head', 'tools', 'controls'], rows: ['auto', 1, 'auto'] },
  },
  children: [region('head'), region('tools'), region('notes'), region('controls')],
};
