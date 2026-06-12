import type { LayoutNode } from '@niscorp/nova';

// The preview view's id — one string for one view: the name its component
// registers under, the id of its action, and the id of its canvas. The plugin
// owns it; the editor host defines no view ids of its own.
export const PREVIEW = 'vex:preview';

// The preview layout: one component bound to the live `query` document. The
// component runs the query and shows the rows.
export const previewLayout: LayoutNode = {
  component: PREVIEW,
  props: { query: '$.query' },
};
