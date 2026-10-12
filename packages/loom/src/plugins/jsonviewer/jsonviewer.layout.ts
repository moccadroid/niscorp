import type { LayoutNode } from '@niscorp/nova';

export const JSONVIEWER = 'loom:jsonviewer';

export const jsonviewerLayout: LayoutNode = {
  component: JSONVIEWER,
  props: { title: 'Data', value: '$.value' },
};
