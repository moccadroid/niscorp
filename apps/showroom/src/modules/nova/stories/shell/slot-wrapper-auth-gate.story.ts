import * as demo from './slot-wrapper-auth-gate.demo';
import source from './slot-wrapper-auth-gate.demo?raw';

export const story = {
  id: 'slot-wrapper-auth-gate',
  name: 'slotWrapper — auth / feature gate',
  description:
    'The same `slotWrapper` seam used as a gate rather than animation. Nova hands the wrapper the ActionDefinition; the wrapper decides — app-side — whether to render the content or a fallback. Auth is plain React state (not Nova data) and the policy is keyed off `action.id`, so the rule lives nowhere near the Nova layout or schema. Toggle sign-in to reveal the gated card.',
  category: 'Slot wrappers',
  kind: 'shell' as const,
  ...demo,
  source,
};
