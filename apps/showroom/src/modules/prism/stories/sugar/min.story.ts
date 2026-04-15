import * as demo from './min.demo';
import source from './min.demo?raw';

export const story = {
  id: 'min',
  name: '$min',
  description: 'Sugar: smallest value in an array. Desugars to a `$reduce` whose body is a `$case` choosing the smaller of accumulator and current. Open **Compiled** to see how much the canonical form expands.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
