import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// `push` appends to an array in the data store. The `for` loop below
// reads the same array, so a push immediately grows the rendered list
// and the `{{$.items.length}}` counter bumps on the next render.

const list: ActionDefinition = {
  id: 'list',
  data: {
    items: [{ name: 'Apple' }, { name: 'Banana' }, { name: 'Cherry' }],
  },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold' },
        children: 'Items: {{$.items.length}}',
      },
      {
        for: '$.items',
        as: 'item',
        do: {
          component: 'Box',
          props: { padding: 12, background: '#f1f5f9', radius: 6 },
          children: { component: 'Text', children: '{{$item.name}}' },
        },
      },
      { component: 'Button', ref: 'add', children: 'Add item' },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'add',
      do: [{ push: 'items', value: { name: 'New item' } }],
    },
  ],
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'list' }],
  actions: { list },
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
