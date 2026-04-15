import * as demo from './coalesce.demo';
import source from './coalesce.demo?raw';

export const story = {
  id: 'coalesce',
  name: '$coalesce',
  description: 'Tries each value in order and returns the first one that is not null/undefined. The classic "fallback chain" — preferred → backup → default.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
