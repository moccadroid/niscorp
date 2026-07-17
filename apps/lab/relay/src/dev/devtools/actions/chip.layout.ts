import type { LayoutNode } from '@niscorp/nova';

// The per-instance chip — a one-button Nova layout rendered at the slotWrapper
// seam against `{ id: <definitionId> }`. Clicking it dispatches `ui:click
// ref:'chip'`; the adapter routes that to a `devtools.inspect` push. Portable:
// another framework's adapter renders this same node with its own Button.
export const chipLayout: LayoutNode = {
  component: 'Button',
  ref: 'chip',
  props: { size: 'sm', variant: 'ghost' },
  children: '⚙ {{$.id}}',
};
