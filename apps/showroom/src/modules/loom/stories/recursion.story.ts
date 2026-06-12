import * as demo from './recursion.demo';
import source from './recursion.demo?raw';

export const story = {
  id: 'recursion',
  name: 'Recursion',
  description:
    'A recursive schema — a comment tree of nodes that each hold replies of their own shape. The parser stops at the cycle with a single `self` marker; the renderer emits one self-referencing template that Nova resolves against the data, so the editor is exactly as deep as the document. Add a reply at any depth and watch it grow — the template and the model are in the Definition tab.',
  category: 'Structure',
  kind: 'structure' as const,
  ...demo,
  source,
};
