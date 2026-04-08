import type { PrismStory } from '../../story-types';

export const mapShapeStory: PrismStory = {
  id: 'map-shape',
  name: 'Map → shape',
  description:
    'Map an array of records into a different shape per element. The body of $map can be a template object — every value inside it is evaluated against the loop scope.',
  category: 'Composition',
  kind: 'transform',
  input: {
    users: [
      { id: 'u_1', first: 'Ada', last: 'Lovelace' },
      { id: 'u_2', first: 'Grace', last: 'Hopper' },
      { id: 'u_3', first: 'Linus', last: 'Torvalds' },
    ],
  },
  config: {
    $map: {
      over: { $ref: '$.users' },
      as: 'u',
      body: {
        id: { $get: { from: { $var: 'u' }, path: ['id'] } },
        fullName: {
          $join: {
            sep: ' ',
            parts: [
              { $get: { from: { $var: 'u' }, path: ['first'] } },
              { $get: { from: { $var: 'u' }, path: ['last'] } },
            ],
          },
        },
      },
    },
  },
  expected: [
    { id: 'u_1', fullName: 'Ada Lovelace' },
    { id: 'u_2', fullName: 'Grace Hopper' },
    { id: 'u_3', fullName: 'Linus Torvalds' },
  ],
};
