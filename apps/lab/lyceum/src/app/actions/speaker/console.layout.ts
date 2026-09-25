import type { LayoutNode } from '@niscorp/nova';

export const consoleLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12, p: 24 },
  children: [
    { component: 'Text', props: { as: 'h2' }, children: 'Controller' },
    { component: 'Text', children: '{{$.counts.joined}} joined · {{$.counts.sorted}} sorted' },
    {
      if: '$.sorting',
      then: { component: 'Text', children: 'Sorting…' },
      else: { component: 'Button', ref: 'sort', children: 'Sort the room' },
    },
    { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
  ],
};
