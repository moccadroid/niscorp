import type { PrismExample } from './example.types';

// The shorthands, one example each. A shorthand is rewritten into the operators
// it stands for before a config is evaluated.
export const SUGAR: readonly PrismExample[] = [
  {
    id: 'sum',
    group: 'sugar',
    title: '$sum',
    description: 'Adds up the numbers of a list. Shorthand for a `$reduce` with an `$add`.',
    op: '$sum',
    source: { values: [10, 20, 30, 40] },
    config: { $sum: { over: { $ref: '$.values' } } },
    expected: 100,
  },
  {
    id: 'count',
    group: 'sugar',
    title: '$count',
    description: 'Counts the elements of a list. Shorthand for a `$reduce` that adds one for each.',
    op: '$count',
    source: { items: ['apple', 'banana', 'cherry', 'date', 'elderberry'] },
    config: { $count: { over: { $ref: '$.items' } } },
    expected: 5,
  },
  {
    id: 'avg',
    group: 'sugar',
    title: '$avg',
    description:
      'The mean of the numbers of a list. Shorthand for the `$sum` divided by the `$count`.',
    op: '$avg',
    source: { scores: [80, 90, 100, 70] },
    config: { $avg: { over: { $ref: '$.scores' } } },
    expected: 85,
  },
  {
    id: 'min',
    group: 'sugar',
    title: '$min',
    description:
      'The smallest number of a list. Shorthand for a `$reduce` that keeps the smaller of two.',
    op: '$min',
    source: { temps: [22, 18, 25, 14, 27, 19] },
    config: { $min: { over: { $ref: '$.temps' } } },
    expected: 14,
  },
  {
    id: 'max',
    group: 'sugar',
    title: '$max',
    description:
      'The largest number of a list. Shorthand for a `$reduce` that keeps the larger of two.',
    op: '$max',
    source: { scores: [42, 67, 89, 33, 95, 78] },
    config: { $max: { over: { $ref: '$.scores' } } },
    expected: 95,
  },
  {
    id: 'pluck',
    group: 'sugar',
    title: '$pluck',
    description:
      'One field out of every record of a list. Shorthand for a `$map` whose body is a `$get` of that key.',
    op: '$pluck',
    source: {
      users: [
        { id: 'u1', name: 'Ada' },
        { id: 'u2', name: 'Grace' },
        { id: 'u3', name: 'Linus' },
      ],
    },
    config: { $pluck: { over: { $ref: '$.users' }, key: 'name' } },
    expected: ['Ada', 'Grace', 'Linus'],
  },
  {
    id: 'take',
    group: 'sugar',
    title: '$take',
    description:
      'The first elements of a list, as many as asked for. Shorthand for a `$slice` from the start.',
    op: '$take',
    source: { numbers: [10, 20, 30, 40, 50, 60, 70, 80] },
    config: { $take: { from: { $ref: '$.numbers' }, count: 3 } },
    expected: [10, 20, 30],
  },
  {
    id: 'drop',
    group: 'sugar',
    title: '$drop',
    description:
      'A list without its first elements, as many as asked for. Shorthand for a `$slice` to the end.',
    op: '$drop',
    source: { numbers: [10, 20, 30, 40, 50, 60, 70, 80] },
    config: { $drop: { from: { $ref: '$.numbers' }, count: 3 } },
    expected: [40, 50, 60, 70, 80],
  },
  {
    id: 'match',
    group: 'sugar',
    title: '$match',
    description:
      'Keeps the strings of a list that contain a given text. Shorthand for a `$filter` with a `$contains`.',
    op: '$match',
    source: { tags: ['frontend', 'backend', 'devops', 'frontend-react', 'database'] },
    config: { $match: { over: { $ref: '$.tags' }, as: 'tag', search: { $const: 'front' } } },
    expected: ['frontend', 'frontend-react'],
  },
  {
    id: 'flat-map',
    group: 'sugar',
    title: '$flatMap',
    description:
      'Maps each element to a list and joins those lists into one. Shorthand for a `$flatten` over a `$map`.',
    op: '$flatMap',
    source: {
      folders: [
        { name: 'work', files: ['report.pdf', 'notes.md'] },
        { name: 'personal', files: ['photo.jpg'] },
        { name: 'archive', files: ['old.txt', 'older.txt', 'oldest.txt'] },
      ],
    },
    config: {
      $flatMap: {
        over: { $ref: '$.folders' },
        as: 'folder',
        body: { $get: { from: { $var: 'folder' }, path: ['files'] } },
      },
    },
    expected: ['report.pdf', 'notes.md', 'photo.jpg', 'old.txt', 'older.txt', 'oldest.txt'],
  },
];
