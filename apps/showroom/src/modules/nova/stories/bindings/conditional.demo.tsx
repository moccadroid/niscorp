import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// `if / then / else` layout nodes. The branch is picked at render
// time based on the truthiness of the `if` expression. Flip
// `isLoggedIn` in the data tree and both Texts swap branches.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    {
      if: '$.isLoggedIn',
      then: {
        component: 'Text',
        props: { size: 'lg', weight: 'bold' },
        children: 'Welcome back, {{$.name}}!',
      },
      else: {
        component: 'Text',
        props: { size: 'lg', weight: 'bold' },
        children: 'Please log in.',
      },
    },
    {
      if: '$.isLoggedIn',
      then: {
        component: 'Text',
        props: { size: 'sm', color: '#6b7280' },
        children: '(Click avatar to log out)',
      },
      else: {
        component: 'Text',
        props: { size: 'sm', color: '#6b7280' },
        children: '(No session)',
      },
    },
  ],
};

const data = { isLoggedIn: true, name: 'Linus' };

export { layout, data };

export const Demo = () => <Nova.Layout layout={layout} data={data} />;
