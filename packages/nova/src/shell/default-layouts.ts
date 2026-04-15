import type { LayoutNode } from '../layout';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from './slot-names';

// ═══════════════════════════════════════════════════════════
// Default layouts used when a shell or canvas does not declare
// its own. Preserves pre-layout-aware behaviour:
//   - shell: flex row over canvases, one CanvasSlot per canvas
//   - canvas: render only the top-of-stack instance
// ═══════════════════════════════════════════════════════════

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
