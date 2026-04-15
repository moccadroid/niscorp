import * as demo from './subtree-finalization.demo';
import source from './subtree-finalization.demo?raw';

export const story = {
  id: 'subtree-finalization',
  name: 'Subtree finalization',
  description: 'Subtrees finalize as the parser moves past them — no waiting for the full stream.',
  category: 'Finalization',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
