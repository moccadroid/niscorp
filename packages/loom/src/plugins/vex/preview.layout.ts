import type { LayoutNode } from '@niscorp/nova';

export const PREVIEW = 'vex:preview';

export const previewLayout: LayoutNode = {
  component: PREVIEW,
  props: { query: '$.query' },
};
