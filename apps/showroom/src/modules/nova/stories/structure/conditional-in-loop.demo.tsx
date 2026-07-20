import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// Two conditional flavors, both scoped to `$item` inside a loop:
// 1. Inline `{$if,$then,$else}` on the Box `background` prop —
//    picks a value, not a subtree.
// 2. Sibling `if/then/else` node — swaps entire subtrees for the
//    status label.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    {
      for: '$.items',
      as: 'item',
      do: {
        component: 'Box',
        props: {
          padding: 12,
          radius: 6,
          background: {
            $if: '$item.enabled',
            $then: '#dcfce7',
            $else: '#fee2e2',
          },
        },
        children: {
          component: 'Stack',
          props: { direction: 'row', gap: 12, align: 'center' },
          children: [
            {
              component: 'Text',
              props: { weight: 'bold' },
              children: '{{$item.name}}',
            },
            {
              if: '$item.enabled',
              then: {
                component: 'Text',
                props: { size: 'sm' },
                children: '\u2713 enabled',
              },
              else: {
                component: 'Text',
                props: { size: 'sm' },
                children: '\u2717 disabled',
              },
            },
          ],
        },
      },
    },
  ],
};

const data = {
  items: [
    { name: 'Item A', enabled: true },
    { name: 'Item B', enabled: false },
    { name: 'Item C', enabled: true },
  ],
};

export { layout, data };
export const Demo = () => <Nova.Layout layout={layout} data={data} />;
