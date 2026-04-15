import * as demo from './avg.demo';
import source from './avg.demo?raw';

export const story = {
  id: 'avg',
  name: '$avg',
  description: 'Sugar: arithmetic mean of an array. Desugars to `$div($sum, $count)` — two reductions over the same array. The **Compiled** tab shows the dual reduction; the **Stats** tab confirms the doubled node count.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
