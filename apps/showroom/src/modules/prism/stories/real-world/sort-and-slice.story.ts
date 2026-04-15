import * as demo from './sort-and-slice.demo';
import source from './sort-and-slice.demo?raw';

export const story = {
  id: 'sort-and-slice',
  name: 'Top N by field',
  description: 'Sort an array by a computed key and take the first N. The classic "leaderboard" pattern: $sortBy descending, then $slice from 0 to 3.',
  category: 'Real world',
  kind: 'transform' as const,
  ...demo,
  source,
};
