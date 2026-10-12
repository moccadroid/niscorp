import { isComponentNode, isConditionalNode, isLoopNode, isSlotNode } from './guards';
import type { LayoutNode } from './schemas';

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
  return layout;
};
