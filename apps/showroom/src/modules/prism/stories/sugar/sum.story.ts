import * as demo from './sum.demo';
import source from './sum.demo?raw';

export const story = {
  id: 'sum',
  name: '$sum',
  description: 'Sugar: sum every number in an array. Click the **Compiled** tab to see what `$sum` desugars to — a `$reduce` over the array with a `$add` accumulator. The Stats tab shows the node count jump.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
