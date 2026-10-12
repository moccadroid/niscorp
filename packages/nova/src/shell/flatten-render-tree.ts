import type { RenderNode } from '../layout';
import type { Shell } from './types';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from './slot-names';

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
      props: { instanceId, canvasId: runtime.instance.canvasId, definitionId: runtime.instance.definitionId },
      children: runtime.render(),
      key: instanceId,
    };
  }

  return { ...node, children: flattenRenderTree(node.children, shell) };
};
