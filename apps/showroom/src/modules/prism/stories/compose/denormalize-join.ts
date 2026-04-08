import type { PrismStory } from '../../story-types';

export const denormalizeJoinStory: PrismStory = {
  id: 'denormalize-join',
  name: 'Denormalize join',
  description:
    'Take separate `users` and `posts` arrays (relational shape) and produce `users` with their posts inlined. Uses `$keyBy` to index posts by author, then `$map` over users to attach the matching slice via `$filter`.',
  category: 'Composition',
  kind: 'transform',
  input: {
    users: [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Grace' },
      { id: 'u3', name: 'Linus' },
    ],
    posts: [
      { id: 'p1', authorId: 'u1', title: 'On Bernoulli' },
      { id: 'p2', authorId: 'u1', title: 'Engine notes' },
      { id: 'p3', authorId: 'u2', title: 'COBOL origins' },
      { id: 'p4', authorId: 'u3', title: 'Just for fun' },
      { id: 'p5', authorId: 'u3', title: 'Linux history' },
    ],
  },
  config: {
    $map: {
      over: { $ref: '$.users' },
      as: 'user',
      body: {
        id: { $get: { from: { $var: 'user' }, path: ['id'] } },
        name: { $get: { from: { $var: 'user' }, path: ['name'] } },
        posts: {
          $filter: {
            over: { $ref: '$.posts' },
            as: 'post',
            when: {
              $eq: [
                { $get: { from: { $var: 'post' }, path: ['authorId'] } },
                { $get: { from: { $var: 'user' }, path: ['id'] } },
              ],
            },
          },
        },
      },
    },
  },
  expected: [
    {
      id: 'u1',
      name: 'Ada',
      posts: [
        { id: 'p1', authorId: 'u1', title: 'On Bernoulli' },
        { id: 'p2', authorId: 'u1', title: 'Engine notes' },
      ],
    },
    {
      id: 'u2',
      name: 'Grace',
      posts: [{ id: 'p3', authorId: 'u2', title: 'COBOL origins' }],
    },
    {
      id: 'u3',
      name: 'Linus',
      posts: [
        { id: 'p4', authorId: 'u3', title: 'Just for fun' },
        { id: 'p5', authorId: 'u3', title: 'Linux history' },
      ],
    },
  ],
};
