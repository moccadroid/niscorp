import {
  createComponentRegistry,
  createLayoutStore,
  createShell,
  type ComponentRegistry,
  type RenderNode,
} from '@niscorp/nova';
import type { NovaEditor } from '../src/index.js';

// A registry that accepts any component name. The headless renderer only
// needs a name to round-trip a component through RenderNode — concrete
// component values are the React/Vue adapter's job. This lets the Loom
// tests mount compiled forms without registering a kit.
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

// Mount a compiled Nova editor on a one-canvas shell and return the shell plus
// the action's runtime. The recursive templates go into the layout store, just
// as <LoomForm> wires them. The shell's public `dispatch` is how a headless
// test drives `ui:model` events into the form.
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

// Walk a rendered tree and collect every model binding (path + ref), so a
// test can find the ref bound to a given data path and dispatch to it.
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
