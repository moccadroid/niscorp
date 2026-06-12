import type { LayoutNode } from '@niscorp/nova';

// The preview view's id — one string for one view: the name its component
// registers under, the id of its action, and the id of its canvas. The framework
// surface registers the component under it; the core's mount references it.
export const PREVIEW = 'nova:preview';

// The preview layout: one component bound to the editor's live documents (the
// layout + its data). The component renders the layout against the data with Nova.
export const previewLayout: LayoutNode = {
  component: PREVIEW,
  props: { documents: '$.documents' },
};
