import type { LayoutNode } from '@niscorp/nova';

const region = (area: string): LayoutNode => ({
  component: 'Cell',
  props: { area, pad: 'none' },
  children: [{ component: 'CanvasSlot', props: { canvasId: area } }],
});

export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  // On a phone the controller is a remote to walk around with: the slide's
  // tools fill the middle, with what to say folded under them, above Back and Next.
  props: {
    size: 'fill',
    areas: ['head head', 'tools notes', 'attached notes', 'controls controls'],
    rows: ['auto', 3, 1, 'auto'],
    narrow: { areas: ['head', 'tools', 'notes', 'attached', 'controls'], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  },
  children: [region('head'), region('tools'), region('notes'), region('attached'), region('controls')],
};
