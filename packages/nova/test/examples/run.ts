import { createShell, shellSettled, shellView } from '../../src';
import type { RenderNode } from '../../src';
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

// An example, run as it says: its action alone on one canvas, each press in
// turn, then what it holds and what it says.
export const runExample = async (example: NovaExample): Promise<{ data: Record<string, unknown>; says: string[] }> => {
  const shell = createShell({ canvases: [{ id: 'main', initial: example.action.id }], actions: { [example.action.id]: example.action }, registry: createPermissiveRegistry() });
  await shellSettled(shell);
  const instance = shell.getState().canvases['main']?.stack.at(-1);
  if (instance === undefined) throw new Error(`${example.id} did not mount`);
  // drawn once before anything is pressed: a `model` binding listens from its first drawing on
  shellView(shell).api.canvasTree('main');
  for (const press of example.presses) {
    shell.dispatch({ type: press.type ?? 'ui:click', ref: press.ref, ...(press.payload === undefined ? {} : { payload: press.payload }), origin: instance.id });
    await shellSettled(shell);
  }
  return { data: shell.getRuntime(instance.id)?.getData() ?? {}, says: saysOf(shellView(shell).api.canvasTree('main')) };
};
