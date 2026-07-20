import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// `{{…}}` template interpolation inside Text children. Literal
// copy and `{{$.path}}` placeholders mix on the same line;
// the renderer expands each one in place.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    {
      component: 'Text',
      props: { size: 'lg', weight: 'bold' },
      children: 'Welcome, {{$.name}}! You have {{$.unread}} unread messages.',
    },
    {
      component: 'Text',
      props: { size: 'sm', color: '#6b7280' },
      children: 'Your account ID is #{{$.accountId}}.',
    },
  ],
};

const data = { name: 'Grace', unread: 7, accountId: 'A-9842' };

export { layout, data };

export const Demo = () => <Nova.Layout layout={layout} data={data} />;
