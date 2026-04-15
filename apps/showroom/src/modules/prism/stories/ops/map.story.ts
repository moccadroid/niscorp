import * as demo from './map.demo';
import source from './map.demo?raw';

export const story = {
  id: 'map',
  name: '$map',
  description: 'Transforms each element of an array. The current element is bound to a variable named by `as`; the `body` expression runs once per element with that variable in scope.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
