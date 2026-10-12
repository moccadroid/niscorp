import type { RenderNode } from './types';

export const NOVA_MODEL_PROP = 'novaModel';
export const NOVA_REF_PROP = 'novaRef';

// A loop's key wins over `ref`: looped rows share a `ref`, which is an event
// target and not a list key.
export const renderNodeKey = (node: RenderNode, index: number): string => {
  if (node.key !== undefined) return `k:${node.key}`;
  if (node.type === 'component') {
    if (node.ref !== undefined) return `c:${node.ref}`;
    return `c:${node.name}:${index}`;
  }
  if (node.type === 'text') return `t:${index}`;
  if (node.type === 'fragment') return `f:${index}`;
  return `e:${node.code}:${index}`;
};
