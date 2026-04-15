import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// Empty-collection pattern: an `if` guards the `for` loop so an
// empty array shows a gray placeholder instead of a blank space.
// The `then` branch is the loop; the `else` branch is the fallback.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    {
      component: 'Text',
      props: { weight: 'bold', size: 'lg' },
      children: 'Items',
    },
    {
      if: '$.items.length',
      then: {
        for: '$.items',
        as: 'item',
        do: { component: 'Text', children: '{{$item.name}}' },
      },
      else: {
        component: 'Text',
        props: { color: '#9ca3af' },
        children: 'No items yet.',
      },
    },
  ],
};

const data = { items: [] };

export { layout, data };
export const Demo = () => <Nova.Layout layout={layout} data={data} />;
