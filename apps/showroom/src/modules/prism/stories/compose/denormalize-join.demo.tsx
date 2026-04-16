import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
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
  };

export const config = {
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
  };

export const Demo = () => <PrismView input={input} config={config} />;
