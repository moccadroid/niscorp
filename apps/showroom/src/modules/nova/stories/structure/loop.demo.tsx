import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// `for` / `as` / `do` iterates a collection and emits one subtree per
// item. Each iteration binds `$user` to the current element, so the
// template inside `do` renders once per entry in `$.users`.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    {
      for: '$.users',
      as: 'user',
      do: {
        component: 'Box',
        props: { padding: 12, background: '#f1f5f9', radius: 6 },
        children: { component: 'Text', children: '{{$user.name}}' },
      },
    },
  ],
};

const data = {
  users: [
    { name: 'Ada' },
    { name: 'Grace' },
    { name: 'Linus' },
    { name: 'Margaret' },
  ],
};

export { layout, data };
export const Demo = () => <Nova.Layout layout={layout} data={data} />;
