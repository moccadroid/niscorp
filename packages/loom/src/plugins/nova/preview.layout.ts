import type { LayoutNode } from '@niscorp/nova';

export const PREVIEW = 'nova:preview';

export const previewLayout: LayoutNode = {
  component: PREVIEW,
  props: { documents: '$.documents' },
};
