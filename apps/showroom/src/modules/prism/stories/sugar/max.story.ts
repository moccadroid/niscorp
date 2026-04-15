import * as demo from './max.demo';
import source from './max.demo?raw';

export const story = {
  id: 'max',
  name: '$max',
  description: 'Sugar: largest value in an array. Mirror image of `$min` — same `$reduce + $case` structure but the comparison flips to `$gt`. The **Compiled** tab makes the symmetry explicit.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
