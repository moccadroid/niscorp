import type { LayoutNode } from '@niscorp/nova';

// THE CONTROLLER'S ARRANGEMENT — five canvases, nothing else. What stays the
// same stays where it is: the head at the top, Back and Next at the bottom. The
// middle is the slide on screen: its tool on the left, its notes on the right,
// the whole height — notes are read while talking and never scrolled. Under the
// tool, whatever an integration attached to the controller (`attached`: The QA Company's
// questions, once installed), on every slide.
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
    areas: ['head head', 'tools notes', 'attached notes', 'controls controls'],
    rows: ['auto', 2, 1, 'auto'],
    narrow: { areas: ['head', 'tools', 'attached', 'controls'], rows: ['auto', 1, 'auto', 'auto'] },
  },
  children: [region('head'), region('tools'), region('notes'), region('attached'), region('controls')],
};
