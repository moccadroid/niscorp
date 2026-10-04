import { createLayoutStore, createShell, shellSettled } from '../../src';
import type { RenderNode, Shell } from '../../src';
import type { NovaExample } from '../../src/examples';
import { createPermissiveRegistry } from '../helpers';

// Every piece of text a drawn tree holds, in reading order. A node that could
// not be drawn says so by its code.
const saysOf = (nodes: readonly RenderNode[]): string[] =>
  nodes.flatMap((node) => {
    if (node.type === 'text') return node.value === '' ? [] : [node.value];
    if (node.type === 'error') return [`[${node.code}]`];
    return saysOf(node.children);
  });

// The shell an example asks for: its one action alone on one canvas, or its
// own small shell; its fragments and stored layouts; and every endpoint
// answered what the example says it is answered.
export const shellOf = (example: NovaExample): Shell => {
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
    functions: Object.fromEntries(Object.entries(example.replies ?? {}).map(([name, reply]) => [name, async () => reply])),
    fetch: async (url, init) => {
      const reply = example.fetches?.[`${init?.method ?? 'GET'} ${url}`] ?? { status: 404, body: { message: 'Nothing answers here.' } };
      return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body, text: async () => JSON.stringify(reply.body) };
    },
  });
};

// An example, run as it says: mounted, each press in turn, then what the
// screen says, what its one action holds, and what stands on each canvas.
export const runExample = async (example: NovaExample): Promise<NovaExample['expected']> => {
  const shell = shellOf(example);
  await shellSettled(shell);
  const canvases = Object.keys(shell.getState().canvases);
  const top = (canvas: string): string | undefined => shell.getState().canvases[canvas]?.stack.at(-1)?.id;
  // drawn once before anything is pressed: a `model` binding listens from its first drawing on
  const screen = (): string[] => saysOf(shell.flattenRenderTree(shell.getShellRenderTree()));
  screen();
  for (const press of example.presses) {
    const origin = top(press.canvas ?? canvases[0] ?? '');
    if (origin === undefined) throw new Error(`${example.id}: nothing to press on ${press.canvas ?? canvases[0] ?? '(no canvas)'}`);
    shell.dispatch({ type: press.type ?? 'ui:click', ref: press.ref, ...(press.payload === undefined ? {} : { payload: press.payload }), origin });
    await shellSettled(shell);
    screen();
  }
  const only = example.action === undefined ? undefined : top('main');
  return {
    says: screen(),
    ...(only === undefined ? {} : { data: shell.getRuntime(only)?.getData() ?? {} }),
    ...(example.shell === undefined ? {} : { stacks: Object.fromEntries(canvases.map((canvas) => [canvas, (shell.getState().canvases[canvas]?.stack ?? []).map((instance) => instance.definitionId)])) }),
  };
};
