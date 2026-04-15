import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// Nested `for` loops with shadowing scope variables. The outer loop
// binds `$user`; the inner loop — running over `$user.posts` — binds
// `$post`. Both are live simultaneously inside the inner `do` block.

const layout: LayoutNode = {
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
};

const data = {
  users: [
    {
      name: 'Ada',
      posts: [{ title: 'On Bernoulli' }, { title: 'Engine notes' }],
    },
    { name: 'Grace', posts: [{ title: 'COBOL origins' }] },
  ],
};

export { layout, data };
export const Demo = () => <Nova.Layout layout={layout} data={data} />;
