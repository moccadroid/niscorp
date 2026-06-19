import * as demo from './slot-fill.demo';
import source from './slot-fill.demo?raw';

export const story = {
  id: 'compose-slot-fill',
  name: 'Slot fill',
  description:
    'The core mechanism. A fragment is chrome with a `{ slot: "body" }` hole; composing an action `with: [\'framed\']` drops the action’s own layout into it. The action never mentions the frame — composition is decided at the call site. Toggle the same `card` action wrapped vs bare.',
  category: 'Composition',
  kind: 'action' as const,
  ...demo,
  source,
};
