import * as demo from './group-by.demo';
import source from './group-by.demo?raw';

export const story = {
  id: 'group-by',
  name: 'Group by category',
  description: 'Bucket an array of records by a computed key. $groupBy returns an object where each key holds the array of original records that share it.',
  category: 'Real world',
  kind: 'transform' as const,
  ...demo,
  source,
};
