import * as demo from './count.demo';
import source from './count.demo?raw';

export const story = {
  id: 'count',
  name: '$count',
  description: 'Sugar: count the elements of an array. Desugars to a `$reduce` that adds 1 per element. Open the **Compiled** tab to see the canonical form.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
