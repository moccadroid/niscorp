import { isComponentNode, isConditionalNode, isLoopNode, isSlotNode } from './guards';
import type { LayoutNode } from './schemas';

// ═══════════════════════════════════════════════════════════
// fillSlots — replace every `{ slot: name }` placeholder in a layout tree with
// the layout in `fills[name]`. Used by the ActionFragment merge: a fragment's
// chrome layout has a `{ slot: 'body' }`, and the composing action's own layout
// is dropped into it. A slot whose name has no fill is left in place — the
// renderer renders an unfilled slot as nothing.
//
// A pure tree-walk modelled on the layout store's `resolveReferences`: recurse
// through children / then / else / do / arrays, rebuilding the tree.
// ═══════════════════════════════════════════════════════════

export const fillSlots = (layout: LayoutNode, fills: Record<string, LayoutNode>): LayoutNode => {
  if (isSlotNode(layout)) {
    const fill = fills[layout.slot];
    return fill === undefined ? layout : fill;
  }
  if (Array.isArray(layout)) {
    return layout.map((node) => fillSlots(node, fills));
  }
  if (isComponentNode(layout)) {
    const { children } = layout;
    if (children === undefined) return layout;
    const next = Array.isArray(children)
      ? children.map((child) => fillSlots(child, fills))
      : fillSlots(children, fills);
    return { ...layout, children: next };
  }
  if (isConditionalNode(layout)) {
    return {
      ...layout,
      then: fillSlots(layout.then, fills),
      ...(layout.else === undefined ? {} : { else: fillSlots(layout.else, fills) }),
    };
  }
  if (isLoopNode(layout)) {
    return { ...layout, do: fillSlots(layout.do, fills) };
  }
  // primitives, layout refs, slot-less nodes — unchanged
  return layout;
};
