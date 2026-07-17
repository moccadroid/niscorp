import type { RenderNode } from './types';

// ═══════════════════════════════════════════════════════════
// Adapter helpers — framework-agnostic pieces every adapter
// (React, Vue, …) needs to render a RenderNode tree the same
// way. See packages/nova/ADAPTER.md for the full contract.
// ═══════════════════════════════════════════════════════════

// Names of the props an adapter injects on rendered components:
// `RenderNode.model` → NOVA_MODEL_PROP ({ ref, path }),
// `RenderNode.ref` → NOVA_REF_PROP (string). Constants so all
// adapters inject identically and components can rely on them.
export const NOVA_MODEL_PROP = 'novaModel';
export const NOVA_REF_PROP = 'novaRef';

// Stable identity for a RenderNode within its sibling list.
// Loop identity (stamped from LoopNode.key/index) wins over ref: a shared
// `ref` across looped rows is an event-target id, not a list key.
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
