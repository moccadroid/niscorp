import * as demo from './take.demo';
import source from './take.demo?raw';

export const story = {
  id: 'take',
  name: '$take',
  description: 'Sugar: take the first N elements of an array. Desugars to `$slice` from 0 to N. The **Compiled** tab confirms it\u2019s just a slice under the hood.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
