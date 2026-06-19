import * as demo from './reuse.demo';
import source from './reuse.demo?raw';

export const story = {
  id: 'compose-reuse',
  name: 'One fragment, many actions',
  description:
    'Composition pays off in reuse: define the chrome once, wrap many actions. Three different stat actions are each seeded `with: [\'tile\']` — identical frame, different bodies, and the frame’s header still reads each action’s own `label`. Edit `tile` once and all three move. This is why a modal or list shell becomes a fragment instead of a copy-pasted layout.',
  category: 'Composition',
  kind: 'action' as const,
  ...demo,
  source,
};
