import type { LayoutNode } from '@niscorp/nova';

export const cardLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 8, p: 24 },
  children: [
    { component: 'Text', props: { as: 'h2' }, children: '{{$.me.name}}' },
    {
      if: '$.me.house_name',
      then: { component: 'Text', children: 'House {{$.me.house_name}}' },
      else: { component: 'Text', children: 'Not yet sorted. Wait for the sorting.' },
    },
  ],
};
