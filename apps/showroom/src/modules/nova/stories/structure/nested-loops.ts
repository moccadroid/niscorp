import type { LayoutStory } from '../../story-types';

export const structureNestedLoopsStory: LayoutStory = {
  id: 'structure-nested-loops',
  name: 'Nested loops',
  description:
    "Demonstrates nested `for` loops with shadowing scope variables. The outer loop binds each user to `$user`; the inner loop iterates `$user.posts` and binds each post to `$post`. The result: a heading per user followed by their post titles, all driven by a single nested data array.",
  kind: 'layout',
  category: 'Structure',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        for: '$.users',
        as: 'user',
        do: {
          component: 'Stack',
          props: { direction: 'column', gap: 6 },
          children: [
            {
              component: 'Text',
              props: { weight: 'bold', size: 'lg' },
              children: '{{$user.name}}',
            },
            {
              for: '$user.posts',
              as: 'post',
              do: {
                component: 'Box',
                props: { padding: 8, background: '#f8fafc', radius: 4 },
                children: { component: 'Text', children: '{{$post.title}}' },
              },
            },
          ],
        },
      },
    ],
  },
  data: {
    users: [
      {
        name: 'Ada',
        posts: [{ title: 'On Bernoulli' }, { title: 'Engine notes' }],
      },
      { name: 'Grace', posts: [{ title: 'COBOL origins' }] },
    ],
  },
  expected: {
    textIncludes: [
      'Ada',
      'Grace',
      'On Bernoulli',
      'Engine notes',
      'COBOL origins',
    ],
  },
};
