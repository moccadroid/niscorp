import * as demo from './slot-wrapper-animation.demo';
import source from './slot-wrapper-animation.demo?raw';

export const story = {
  id: 'slot-wrapper-animation',
  name: 'slotWrapper — animated region',
  description:
    'A `slotWrapper` passed to `<Nova.Shell>` wraps each action instance at the ActionSlot seam. Here it animates only the `main` region (keyed by instanceId, so every swapped card replays a CSS enter) and leaves the controls bar untouched. Nova owns no animation — the wrapper does. This demo is CSS enter-only; full exit (slide-out on close) is the same seam plus a presence lib (framer-motion / react-transition-group).',
  category: 'Slot wrappers',
  kind: 'shell' as const,
  ...demo,
  source,
};
