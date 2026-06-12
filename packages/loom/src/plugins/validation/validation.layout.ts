import type { LayoutNode } from '@niscorp/nova';

// The view's id — one string for one view: the name its component registers
// under, the id of its action, and the id of its canvas. The plugin owns it; the
// editor host defines no view ids of its own.
export const VALIDATION = 'loom:validation';

// A read-only JSON pane titled "Validations", bound to the `value` the mount
// syncs (the editor's per-document validation problems).
export const validationLayout: LayoutNode = {
  component: VALIDATION,
  props: { title: 'Validations', value: '$.value' },
};
