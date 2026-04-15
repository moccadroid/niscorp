import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

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

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();
const nodes = renderLayout(layout, data, { store: layoutStore, registry });

const noop = (): void => {};

export const Demo = () => (
  <NovaRenderProvider registry={registry} dispatch={noop} publish={noop}>
    <RenderTree nodes={nodes} />
  </NovaRenderProvider>
);
