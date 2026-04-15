import * as demo from './predicates.demo';
import source from './predicates.demo?raw';

export const story = {
  id: 'predicates',
  name: 'Predicate ops',
  description: 'A tour of the comparison ops: `$eq`, `$neq`, `$gt`, `$lt`, `$startsWith`, `$contains`, `$empty`. Each returns a boolean. Combine them inside `$filter`, `$case`, or logic ops.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
