import * as demo from './key-by.demo';
import source from './key-by.demo?raw';

export const story = {
  id: 'key-by',
  name: '$keyBy',
  description: 'Indexes an array of records by a computed key, returning an object. Last record wins on collisions. The classic "turn an array into a lookup table" pattern.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
