import type { LayoutNode } from '../layout';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from './slot-names';

export const DEFAULT_SHELL_LAYOUT: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row' },
  children: [
    {
      for: '$.canvases',
      as: 'c',
      key: 'id',
      do: {
        component: CANVAS_SLOT_NAME,
        props: { canvasId: '$.c.id' },
      },
    },
  ],
};

export const DEFAULT_ACTION_LAYOUT: LayoutNode = {
  component: ACTION_SLOT_NAME,
  props: { instanceId: '$.active.id' },
};
