import { Demo } from './nested-loops.demo';
import source from './nested-loops.demo?raw';

export const story = {
  id: 'structure-nested-loops',
  name: 'Nested loops',
  description:
    'Two `for` loops stacked. Outer binds `$user`, inner iterates `$user.posts` and binds `$post` — both scopes visible to the innermost children.',
  category: 'Structure',
  kind: 'layout' as const,
  Demo,
  source,
};
