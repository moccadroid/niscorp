import type { LayoutNode } from '@niscorp/nova';

// The view's id — one string for one view: the name its component registers
// under, the id of its action, and the id of its canvas. The plugin owns it; the
// editor host defines no view ids of its own.
export const JSONVIEWER = 'loom:jsonviewer';

// A read-only JSON pane titled "Data", bound to the `value` the mount syncs (the
// editor's live documents).
export const jsonviewerLayout: LayoutNode = {
  component: JSONVIEWER,
  props: { title: 'Data', value: '$.value' },
};
