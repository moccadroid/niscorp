import {
  createComponentRegistry,
  createLayoutStore,
  createShell,
  type ComponentRegistry,
  type RenderNode,
} from '@niscorp/nova';
import type { NovaEditor } from '../src/index.js';

export const permissiveRegistry = (): ComponentRegistry => {
  const inner = createComponentRegistry();
  return {
    register: inner.register,
    registerAll: inner.registerAll,
    get: inner.get,
    list: inner.list,
    has: () => true,
  };
};

export const mountForm = (editor: NovaEditor) => {
  const layoutStore = createLayoutStore();
  for (const [name, node] of Object.entries(editor.layouts)) layoutStore.set(name, node);
  const shell = createShell({
    canvases: [{ id: 'main' }],
    registry: permissiveRegistry(),
    actions: { [editor.action.id]: editor.action },
    layoutStore,
  });
  const instanceId = shell.push('main', editor.action.id);
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) throw new Error('mountForm: no runtime for pushed action');
  return { shell, runtime, instanceId };
};

export type ModelBinding = { path: string; ref: string };

export const collectModels = (nodes: RenderNode[]): ModelBinding[] => {
  const out: ModelBinding[] = [];
  const walk = (node: RenderNode): void => {
    if (node.type === 'component') {
      if (node.model !== undefined) out.push({ path: node.model.path, ref: node.model.ref });
      for (const child of node.children) walk(child);
    } else if (node.type === 'fragment') {
      for (const child of node.children) walk(child);
    }
  };
  for (const node of nodes) walk(node);
  return out;
};
