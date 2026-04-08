import type { PrismStory } from '../../story-types';

export const sortAndSliceStory: PrismStory = {
  id: 'sort-and-slice',
  name: 'Top N by field',
  description:
    'Sort an array by a computed key and take the first N. The classic "leaderboard" pattern: $sortBy descending, then $slice from 0 to 3.',
  category: 'Real world',
  kind: 'transform',
  input: {
    players: [
      { name: 'Ada', score: 187 },
      { name: 'Grace', score: 245 },
      { name: 'Linus', score: 132 },
      { name: 'Margaret', score: 298 },
      { name: 'Donald', score: 91 },
      { name: 'Tim', score: 211 },
    ],
  },
  config: {
    $slice: {
      from: {
        $sortBy: {
          over: { $ref: '$.players' },
          as: 'p',
          by: { $get: { from: { $var: 'p' }, path: ['score'] } },
          dir: 'desc',
        },
      },
      start: 0,
      end: 3,
    },
  },
  expected: [
    { name: 'Margaret', score: 298 },
    { name: 'Grace', score: 245 },
    { name: 'Tim', score: 211 },
  ],
};
