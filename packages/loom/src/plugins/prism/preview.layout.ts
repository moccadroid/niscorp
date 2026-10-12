import type { LayoutNode } from '@niscorp/nova';

export const PREVIEW = 'prism:preview';

export const previewLayout: LayoutNode = {
  component: PREVIEW,
  props: { config: '$.config' },
};
