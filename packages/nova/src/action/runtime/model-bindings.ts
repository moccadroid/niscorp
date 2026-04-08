import type { RenderNode } from '@layout/types';

// ═══════════════════════════════════════════════════════════
// Walk a RenderNode[] tree and collect every model binding.
// Used by the action runtime to install listeners on the event bus
// that write `ui:model` payloads back into the data store.
// ═══════════════════════════════════════════════════════════

export type ModelBinding = {
  ref: string;
  path: string;
};

const walk = (node: RenderNode, out: ModelBinding[]): void => {
  if (node.type === 'component') {
    if (node.model !== undefined) {
      out.push({ ref: node.model.ref, path: node.model.path });
    }
    for (const child of node.children) walk(child, out);
    return;
  }
  if (node.type === 'fragment') {
    for (const child of node.children) walk(child, out);
  }
};

export const collectModelBindings = (nodes: RenderNode[]): ModelBinding[] => {
  const out: ModelBinding[] = [];
  for (const node of nodes) walk(node, out);
  return out;
};
