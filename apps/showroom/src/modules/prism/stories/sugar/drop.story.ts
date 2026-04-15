import * as demo from './drop.demo';
import source from './drop.demo?raw';

export const story = {
  id: 'drop',
  name: '$drop',
  description: 'Sugar: skip the first N elements of an array, keep the rest. Mirror of `$take`. Also desugars to `$slice` — just with `start` set instead of `end`.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
