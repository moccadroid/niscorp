import * as demo from './pluck.demo';
import source from './pluck.demo?raw';

export const story = {
  id: 'pluck',
  name: '$pluck',
  description: 'Sugar: extract a single field from every element in an array. Desugars to `$map` whose body is a `$get` for the named key. Same result, less typing — open **Compiled** to see the expanded form.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
