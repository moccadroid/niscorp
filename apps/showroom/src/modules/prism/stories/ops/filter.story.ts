import * as demo from './filter.demo';
import source from './filter.demo?raw';

export const story = {
  id: 'filter',
  name: '$filter',
  description: 'Keeps only the array elements where `when` evaluates truthy. Combine with predicate ops ($gt, $eq, $contains, etc.) to express the condition.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
