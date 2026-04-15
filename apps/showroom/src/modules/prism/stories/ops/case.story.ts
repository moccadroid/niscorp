import * as demo from './case.demo';
import source from './case.demo?raw';

export const story = {
  id: 'case',
  name: '$case',
  description: 'Conditional branching. Branches are evaluated in order; the first whose `when` is truthy returns its `then`. Falls back to `else` if none match.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
