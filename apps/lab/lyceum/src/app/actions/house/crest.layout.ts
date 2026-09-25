import type { LayoutNode } from '@niscorp/nova';

export const crestLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 8, p: 24 },
  children: [{ component: 'Text', props: { as: 'h2' }, children: 'You belong to the {{$.me.house_name}}' }],
};
