import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type LayoutNode,
} from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// Two layers of `if/then/else`. Outer branch: is there a user?
// Inner (when yes): is that user an admin? Three total render
// states — admin panel, user dashboard, or the login box.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 16, padding: 24 },
  children: [
    {
      if: '$.user',
      then: {
        if: '$.user.isAdmin',
        then: {
          component: 'Box',
          props: { padding: 16, background: '#fef3c7', radius: 6 },
          children: [
            { component: 'Text', props: { weight: 'bold', size: 'lg' }, children: 'Admin panel' },
            { component: 'Text', children: 'Welcome, {{$.user.name}} (admin)' },
          ],
        },
        else: {
          component: 'Box',
          props: { padding: 16, background: '#dbeafe', radius: 6 },
          children: [
            { component: 'Text', props: { weight: 'bold', size: 'lg' }, children: 'User dashboard' },
            { component: 'Text', children: 'Welcome, {{$.user.name}}' },
          ],
        },
      },
      else: {
        component: 'Box',
        props: { padding: 16, background: '#f3f4f6', radius: 6 },
        children: { component: 'Text', children: 'Please log in.' },
      },
    },
  ],
};

const data = { user: { name: 'Ada Lovelace', isAdmin: true } };

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
