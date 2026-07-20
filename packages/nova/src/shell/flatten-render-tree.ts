import type { RenderNode } from '../layout';
import type { Shell } from './types';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from './slot-names';

// ═══════════════════════════════════════════════════════════
// flattenRenderTree — expand slot markers into their resolved
// content. A shell render tree contains CanvasSlot / ActionSlot
// component nodes that only recurse at React render time; tests
// and framework-agnostic consumers need a fully materialised tree.
//
// CanvasSlot → inline getCanvasRenderTree(canvasId), flattened.
// ActionSlot → the marker SURVIVES, carrying identity (instanceId /
//   canvasId / definitionId) with runtime.render() as its children —
//   the per-instance boundary is part of the tree, so a remote
//   renderer can key reconciliation by instance and an app-supplied
//   slotWrapper can wrap each instance (animation, gating, chips).
//   A target with no wrapper renders the children straight through.
// Unknown / missing ids resolve to an empty fragment (an empty slot
// is NOT a marker — an empty canvas must stay visibly empty).
// ═══════════════════════════════════════════════════════════

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const emptyFragment = (): RenderNode => ({ type: 'fragment', children: [] });

export const flattenRenderTree = (tree: RenderNode[], shell: Shell): RenderNode[] =>
  tree.map((node) => flattenNode(node, shell));

const flattenNode = (node: RenderNode, shell: Shell): RenderNode => {
  if (node.type !== 'component') {
    if (node.type === 'fragment') {
      return { type: 'fragment', children: flattenRenderTree(node.children, shell) };
    }
    return node;
  }

  if (node.name === CANVAS_SLOT_NAME) {
    const canvasId = asString(node.props['canvasId']);
    if (canvasId === undefined) return emptyFragment();
    return { type: 'fragment', children: flattenRenderTree(shell.getCanvasRenderTree(canvasId), shell) };
  }

  if (node.name === ACTION_SLOT_NAME) {
    const instanceId = asString(node.props['instanceId']);
    if (instanceId === undefined) return emptyFragment();
    const runtime = shell.getRuntime(instanceId);
    if (runtime === undefined) return emptyFragment();
    return {
      type: 'component',
      name: ACTION_SLOT_NAME,
      // identity only — never the definition itself (wire weight)
      props: { instanceId, canvasId: runtime.instance.canvasId, definitionId: runtime.instance.definitionId },
      children: runtime.render(),
      // keyed by instance so a renderer remounts when the instance changes
      // (no stale DOM state across instance swaps, enter animations fire)
      key: instanceId,
    };
  }

  return { ...node, children: flattenRenderTree(node.children, shell) };
};
