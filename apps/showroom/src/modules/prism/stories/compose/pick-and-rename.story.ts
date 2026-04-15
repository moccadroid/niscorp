import * as demo from './pick-and-rename.demo';
import source from './pick-and-rename.demo?raw';

export const story = {
  id: 'pick-and-rename',
  name: 'Pick + rename',
  description: 'Build a smaller object from a larger one. A plain object literal in a prism config is treated as a template — each value is itself an expression. Combine with $ref to pull fields and rename them.',
  category: 'Composition',
  kind: 'transform' as const,
  ...demo,
  source,
};
