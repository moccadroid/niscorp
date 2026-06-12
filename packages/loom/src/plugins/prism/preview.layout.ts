import type { LayoutNode } from '@niscorp/nova';

// The preview view's id, one string for one view: the component name, the action
// id, and the canvas id. The framework surface registers the component under it;
// the core's mount references it.
export const PREVIEW = 'prism:preview';

// The preview layout: one component bound to the live `config` document. The
// component applies the config to a sample input and shows the output.
export const previewLayout: LayoutNode = {
  component: PREVIEW,
  props: { config: '$.config' },
};
