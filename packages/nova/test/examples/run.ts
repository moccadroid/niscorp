import { prismTransform } from '@niscorp/prism/migrations';
import { createLayoutStore, createShell, shellIdle } from '../../src';
import type { RenderNode, Shell } from '../../src';
import type { NovaExample } from '../../src/examples';
import { matcherFor } from '../../src/i18n';
import { createPermissiveRegistry } from '../helpers';

type Asked = NonNullable<NovaExample['expected']['asked']>[number];

// What stands in props at a prose key, at any depth: a placeholder, a label, a column's label.
const proseOf = (value: unknown, isProse: (key: string) => boolean, under = false): string[] => {
  if (typeof value === 'string') return under && value !== '' ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((inner) => proseOf(inner, isProse, under));
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, inner]) => proseOf(inner, isProse, isProse(key)));
  return [];
};

// Every piece of text a drawn tree holds, in reading order: its text nodes, and
// what its components carry at a prose key. A node that could not be drawn says
// so by its code.
const saysOf = (nodes: readonly RenderNode[], isProse: (key: string) => boolean): string[] =>
  nodes.flatMap((node) => {
    if (node.type === 'text') return node.value === '' ? [] : [node.value];
    if (node.type === 'error') return [`[${node.code}]`];
    return [...(node.type === 'component' ? proseOf(node.props, isProse) : []), ...saysOf(node.children, isProse)];
  });

// The shell an example asks for: its one action alone on one canvas, or its
// own small shell; its fragments, stored layouts and book; and every endpoint
// answered what the example says it is answered. `asked` is filled with what
// is sent to each URL.
export const shellOf = (example: NovaExample, asked: Asked[] = []): Shell => {
  const layoutStore = createLayoutStore();
  for (const [id, layout] of Object.entries(example.layouts ?? {})) layoutStore.set(id, layout);
  const alone = example.action === undefined ? undefined : { canvases: [{ id: 'main', initial: example.action.id }], actions: { [example.action.id]: example.action } };
  const app = example.shell ?? alone;
  if (app === undefined) throw new Error(`${example.id} has neither an action nor a shell`);
  return createShell({
    canvases: [...app.canvases],
    actions: { ...app.actions },
    ...('canvasLayout' in app && app.canvasLayout !== undefined ? { canvasLayout: app.canvasLayout } : {}),
    fragments: { ...example.fragments },
    layoutStore,
    registry: createPermissiveRegistry(),
    ...(example.phrases === undefined ? {} : { phrases: example.phrases }),
    ...(example.phraseKeys === undefined ? {} : { phraseKeys: example.phraseKeys }),
    transform: prismTransform,
    functions: Object.fromEntries(Object.entries(example.replies ?? {}).map(([name, reply]) => [name, async () => reply])),
    fetch: async (url, init) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body === undefined ? undefined : JSON.parse(init.body);
      asked.push({ method, url, ...(init?.headers === undefined ? {} : { headers: init.headers }), ...(body === undefined ? {} : { body }) });
      const reply = example.fetches?.[`${method} ${url}`] ?? { status: 404, body: { message: 'Nothing answers here.' } };
      return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body, text: async () => JSON.stringify(reply.body) };
    },
  });
};

// An example, run as it says: mounted, each thing done in turn — and whatever
// that set going left to finish, however long an endpoint takes to answer —
// then what the screen says, what its one action holds, what stands on each
// canvas, and what it asked the outside for.
export const runExample = async (example: NovaExample): Promise<NovaExample['expected']> => {
  const asked: Asked[] = [];
  const shell = shellOf(example, asked);
  await shellIdle(shell);
  const { isProse } = matcherFor(example.phraseKeys);
  const canvases = Object.keys(shell.getState().canvases);
  const top = (canvas: string): string | undefined => shell.getState().canvases[canvas]?.stack.at(-1)?.id;
  // drawn once before anything is pressed: a `model` binding listens from its first drawing on
  const screen = (): string[] => saysOf(shell.flattenRenderTree(shell.getShellRenderTree()), isProse);
  screen();
  for (const press of example.presses) {
    if ('phrases' in press) shell.setPhrases(press.phrases ?? undefined);
    else {
      const origin = top(press.canvas ?? canvases[0] ?? '');
      if (origin === undefined) throw new Error(`${example.id}: nothing to press on ${press.canvas ?? canvases[0] ?? '(no canvas)'}`);
      shell.dispatch({ type: press.type ?? 'ui:click', ref: press.ref, ...(press.payload === undefined ? {} : { payload: press.payload }), origin });
    }
    await shellIdle(shell);
    screen();
  }
  const only = example.action === undefined ? undefined : top('main');
  return {
    says: screen(),
    ...(only === undefined ? {} : { data: shell.getRuntime(only)?.getData() ?? {} }),
    ...(example.shell === undefined ? {} : { stacks: Object.fromEntries(canvases.map((canvas) => [canvas, (shell.getState().canvases[canvas]?.stack ?? []).map((instance) => instance.definitionId)])) }),
    ...(asked.length === 0 ? {} : { asked }),
  };
};
