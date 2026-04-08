import type { PrismStory } from '../../story-types';

export const predicatesStory: PrismStory = {
  id: 'predicates',
  name: 'Predicate ops',
  description:
    'A tour of the comparison ops: `$eq`, `$neq`, `$gt`, `$lt`, `$startsWith`, `$contains`, `$empty`. Each returns a boolean. Combine them inside `$filter`, `$case`, or logic ops.',
  category: 'Operators',
  kind: 'transform',
  input: { name: 'Ada Lovelace', age: 36, tags: ['math', 'engine'] },
  config: {
    isAdult: { $gte: [{ $ref: '$.age' }, { $const: 18 }] },
    isOver40: { $gt: [{ $ref: '$.age' }, { $const: 40 }] },
    isAda: { $eq: [{ $ref: '$.name' }, { $const: 'Ada Lovelace' }] },
    nameStartsWithA: { $startsWith: { value: { $ref: '$.name' }, prefix: { $const: 'Ada' } } },
    nameContainsLove: { $contains: { value: { $ref: '$.name' }, search: { $const: 'Love' } } },
    hasTags: { $not: { $empty: { $ref: '$.tags' } } },
  },
  expected: {
    isAdult: true,
    isOver40: false,
    isAda: true,
    nameStartsWithA: true,
    nameContainsLove: true,
    hasTags: true,
  },
};
