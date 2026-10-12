import { z, type ZodType } from 'zod';
import { createLayoutStore, createShell, type ActionDefinition, type Shell } from '@niscorp/nova';
import { parse, buildDocument, isRecord } from '@compile/parse';
import { toNova, ERROR_NAMESPACE } from '@compile/to-nova';
import { attachValidation } from '../validate.js';
import { defaultCanvasLayout } from './default.layout.js';
import type { LoomArtifact, LoomEditor, LoomEditorConfig, LoomEvent, LoomPlugin } from './types.js';

export type { LoomArtifact, LoomEditor, LoomEditorConfig, LoomEvent, LoomPlugin, Document, DocumentLayout, WidgetBinding } from './types.js';
export { mountView } from './view.js';

const formCanvas = (document: string): string => `form:${document}`;

const ROOT_KEY = '$root';

const needsWrap = (document: ZodType): boolean => parse(document).kind !== 'object';

const stripErrors = (data: Record<string, unknown>): Record<string, unknown> => {
  const { [ERROR_NAMESPACE]: _omit, ...document } = data;
  return document;
};

export const createLoomEditor = (config: LoomEditorConfig): LoomEditor => {
  const plugins = new Map<string, LoomPlugin>();
  const listeners: Record<LoomEvent, Set<() => void>> = { change: new Set(), open: new Set() };
  const emit = (event: LoomEvent): void => listeners[event].forEach((handler) => handler());

  const store = createLayoutStore();
  const shell: Shell = createShell({
    canvases: [],
    registry: config.registry,
    actions: {},
    layoutStore: store,
  });

  let active: LoomPlugin | undefined;
  let formInstances: Record<string, string> = {};
  let wrappedDocs = new Set<string>();
  let formCanvasIds: string[] = [];
  let documents: Record<string, unknown> = {};
  let validations: Record<string, unknown> = {};
  let detach: Array<() => void> = [];

  const refresh = (): void => {
    const nextDocs: Record<string, unknown> = {};
    const nextProblems: Record<string, unknown> = {};
    for (const [name, instanceId] of Object.entries(formInstances)) {
      const data = shell.getRuntime(instanceId)?.getData() ?? {};
      const document = stripErrors(data);
      const problems = (data[ERROR_NAMESPACE] ?? {}) as Record<string, unknown>;
      if (wrappedDocs.has(name)) {
        nextDocs[name] = document[ROOT_KEY];
        nextProblems[name] = problems[ROOT_KEY] ?? {};
      } else {
        nextDocs[name] = document;
        nextProblems[name] = problems;
      }
    }
    documents = nextDocs;
    validations = nextProblems;
  };

  const clearForms = (): void => {
    detach.forEach((off) => off());
    detach = [];
    for (const canvasId of formCanvasIds) shell.removeCanvas(canvasId);
    formCanvasIds = [];
    formInstances = {};
    wrappedDocs = new Set();
  };

  const open = (artifact: LoomArtifact): void => {
    const plugin = plugins.get(artifact.type);
    if (plugin === undefined) throw new Error(`loom editor: no plugin '${artifact.type}'`);
    clearForms();
    active = plugin;

    for (const [name, document] of Object.entries(plugin.documents)) {
      const canvasId = formCanvas(name);
      let action: ActionDefinition;
      if (typeof document === 'function') {
        const value = artifact.documents?.[name];
        action = { id: canvasId, data: isRecord(value) ? value : {}, layout: document(value) };
      } else {
        const ir = parse(document);
        const wrap = needsWrap(document);
        if (wrap) wrappedDocs.add(name);
        const seed = artifact.documents?.[name];
        const value = seed ?? buildDocument(ir, {});
        const built = toNova(ir, {
          id: canvasId,
          ...(wrap ? { rootKey: ROOT_KEY } : {}),
          ...(isRecord(value) ? { value } : {}),
          widgets: plugin.widgets ?? [],
        });
        for (const [id, node] of Object.entries(built.layouts)) store.set(id, node);
        const seedsRoot = wrap && seed !== undefined && seed !== null && !isRecord(seed) && document.safeParse(seed).success;
        action = seedsRoot ? { ...built.action, data: { [ROOT_KEY]: seed } } : built.action;
      }
      shell.registerAction(action);
      shell.addCanvas({ id: canvasId, initial: action.id });
      formCanvasIds.push(canvasId);
      const instanceId = shell.getCanvasState(canvasId).active?.id;
      if (instanceId !== undefined) formInstances[name] = instanceId;
    }

    for (const [name, instanceId] of Object.entries(formInstances)) {
      const document = plugin.documents[name];
      if (typeof document !== 'function' && document !== undefined) {
        const schema = wrappedDocs.has(name) ? z.object({ [ROOT_KEY]: document }) : document;
        detach.push(attachValidation(shell, instanceId, schema));
      }
    }
    detach.push(
      shell.onDataChange((change) => {
        if (!Object.values(formInstances).includes(change.instanceId)) return;
        refresh();
        emit('change');
      }),
    );

    const viewIds = Object.keys(shell.getState().canvases)
      .filter((id) => !formCanvasIds.includes(id))
      .sort((a, b) => Number(a.startsWith('loom:')) - Number(b.startsWith('loom:')));
    shell.setCanvasLayout(defaultCanvasLayout(formCanvasIds, viewIds));

    refresh();
    emit('open');
    // Views sync on `change`: this one hands them the opened documents.
    emit('change');
  };

  const editor: LoomEditor = {
    get shell() {
      return shell;
    },
    get plugin() {
      return active;
    },
    get documents() {
      return documents;
    },
    get validations() {
      return validations;
    },
    loadPlugin: (plugin) => {
      plugins.set(plugin.name, plugin);
      plugin.mount?.(editor);
    },
    open,
    on: (event, handler) => {
      listeners[event].add(handler);
      return () => listeners[event].delete(handler);
    },
    dispose: () => {
      detach.forEach((off) => off());
      detach = [];
      shell.dispose();
    },
  };

  return editor;
};
