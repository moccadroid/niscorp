import * as demo from './omit.demo';
import source from './omit.demo?raw';

export const story = {
  id: 'omit',
  name: '$omit',
  description: 'The inverse of `$pick` — drop specific keys, keep everything else. Cleaner when you want to remove a small set of sensitive fields without listing every safe one.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
