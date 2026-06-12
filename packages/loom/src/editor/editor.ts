import { z, type ZodType } from 'zod';
import { createLayoutStore, createShell, type ActionDefinition, type Shell } from '@niscorp/nova';
import { parse, buildDocument, isRecord } from '@compile/parse';
import { toNova, ERROR_NAMESPACE } from '@compile/to-nova';
import { attachValidation } from '../validate.js';
import { defaultCanvasLayout } from './default.layout.js';
import type { LoomArtifact, LoomEditor, LoomEditorConfig, LoomEvent, LoomPlugin } from './types.js';

export type { LoomArtifact, LoomEditor, LoomEditorConfig, LoomEvent, LoomPlugin, Document, DocumentLayout, WidgetBinding } from './types.js';
export { mountView } from './view.js';

// The Loom Editor controller — framework-free. It owns one Nova shell, built
// empty, and a plugin loader. Everything visible is plugin-contributed: domain
// plugins (nova, vex) declare the documents that `open` compiles into form
// canvases; default plugins (jsonviewer, validation) and previews mount their own
// view canvases against the live shell. The controller only compiles forms and
// publishes the live `documents` / `validations`; the React (or Vue) layer
// supplies the component registry and renders the shell.

// The canvas a document's form lives on.
const formCanvas = (document: string): string => `form:${document}`;

// The key a non-object document (a union, scalar, or array) is wrapped under so
// its single control has a bindable path. Internal: the editor wraps the value
// before compiling and unwraps it before publishing, so it never reaches a
// plugin or the reported document. A document key collides with nothing — it
// holds the whole value, no sibling.
const ROOT_KEY = '$root';

// A document whose schema's root is not an object needs wrapping; an object root
// binds the document root directly.
const needsWrap = (document: ZodType): boolean => parse(document).kind !== 'object';

const stripErrors = (data: Record<string, unknown>): Record<string, unknown> => {
  const { [ERROR_NAMESPACE]: _omit, ...document } = data;
  return document;
};

export const createLoomEditor = (config: LoomEditorConfig): LoomEditor => {
  const plugins = new Map<string, LoomPlugin>();
  const listeners: Record<LoomEvent, Set<() => void>> = { change: new Set(), open: new Set() };
  const emit = (event: LoomEvent): void => listeners[event].forEach((handler) => handler());

  // The shell exists from creation (empty), so plugins can mount onto it. With no
  // canvasLayout, Nova renders the canvases in creation order; a plugin can call
  // shell.setCanvasLayout to arrange them. Form recursion templates are written
  // into this shared store as documents compile.
  const store = createLayoutStore();
  const shell: Shell = createShell({
    canvases: [],
    registry: config.registry,
    actions: {},
    layoutStore: store,
  });

  let active: LoomPlugin | undefined;
  let formInstances: Record<string, string> = {};
  // Documents whose root was wrapped under ROOT_KEY (non-object roots): their
  // value is unwrapped before it is published or validated against the schema.
  let wrappedDocs = new Set<string>();
  let formCanvasIds: string[] = [];
  let documents: Record<string, unknown> = {};
  let validations: Record<string, unknown> = {};
  let detach: Array<() => void> = [];

  // Read every form's live value into `documents` / `validations`. View plugins
  // self-sync off the `change` event, so nothing is pushed to them here.
  const refresh = (): void => {
    const nextDocs: Record<string, unknown> = {};
    const nextProblems: Record<string, unknown> = {};
    for (const [name, instanceId] of Object.entries(formInstances)) {
      const data = shell.getRuntime(instanceId)?.getData() ?? {};
      const document = stripErrors(data);
      const problems = (data[ERROR_NAMESPACE] ?? {}) as Record<string, unknown>;
      // A wrapped document is published as its bare value (and its errors as that
      // value's subtree), so ROOT_KEY never surfaces to a view or a consumer.
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

  // Drop the previous artifact's form canvases (the plugin canvases stay).
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

    // Build each document's form action and add its canvas. A schema document is
    // compiled (toNova); a layout document (freeform, no schema) takes its layout
    // from the plugin. Either way the action's `data` is the document's value —
    // seeded from the artifact, tracked by `refresh`.
    for (const [name, document] of Object.entries(plugin.documents)) {
      const canvasId = formCanvas(name);
      let action: ActionDefinition;
      if (typeof document === 'function') {
        const value = artifact.documents?.[name];
        action = { id: canvasId, data: isRecord(value) ? value : {}, layout: document(value) };
      } else {
        const ir = parse(document);
        // A non-object root binds one level in, under ROOT_KEY (see `needsWrap`).
        const wrap = needsWrap(document);
        if (wrap) wrappedDocs.add(name);
        const value = artifact.documents?.[name] ?? buildDocument(ir, {});
        const built = toNova(ir, {
          id: canvasId,
          ...(wrap ? { rootKey: ROOT_KEY } : {}),
          ...(isRecord(value) ? { value } : {}),
          widgets: plugin.widgets ?? [],
        });
        for (const [id, node] of Object.entries(built.layouts)) store.set(id, node);
        action = built.action;
      }
      shell.registerAction(action);
      shell.addCanvas({ id: canvasId, initial: action.id });
      formCanvasIds.push(canvasId);
      const instanceId = shell.getCanvasState(canvasId).active?.id;
      if (instanceId !== undefined) formInstances[name] = instanceId;
    }

    // Validate only schema documents — a freeform layout document has no schema.
    for (const [name, instanceId] of Object.entries(formInstances)) {
      const document = plugin.documents[name];
      if (typeof document !== 'function' && document !== undefined) {
        // A wrapped document is validated against the same wrapper, so the data
        // and schema agree and the error tree keys under ROOT_KEY (matching the
        // field bindings).
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

    // Arrange the canvases: the forms as the main pane, each contributed view in
    // its own sized pane. View canvases come after the forms; the default JSON
    // panes (loom:*) sort last, so a domain preview sits next to the forms.
    const viewIds = Object.keys(shell.getState().canvases)
      .filter((id) => !formCanvasIds.includes(id))
      .sort((a, b) => Number(a.startsWith('loom:')) - Number(b.startsWith('loom:')));
    shell.setCanvasLayout(defaultCanvasLayout(formCanvasIds, viewIds));

    refresh();
    emit('open');
    // Prime the view plugins with the opened documents.
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
