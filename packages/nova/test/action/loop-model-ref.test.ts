import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import type { RenderNode } from '@layout';
import { createComponentRegistry } from '@layout';

const later = (ms = 0): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const inputs = (nodes: RenderNode[]): RenderNode[] =>
  nodes.flatMap((node) => (node.type === 'component' ? [...(node.name === 'Input' ? [node] : []), ...inputs(node.children)] : node.type === 'fragment' ? inputs(node.children) : []));
const modelOf = (node: RenderNode | undefined): unknown => (node?.type === 'component' ? node.model : undefined);

const registry = () => {
  const r = createComponentRegistry();
  r.registerAll({ Stack: () => null, Input: () => null });
  return r;
};

describe('a model-bound field with a ref inside a loop', () => {
  const cart: ActionDefinition = {
    id: 'cart',
    data: { lines: [{ qty: 1 }, { qty: 1 }, { qty: 1 }], changed: 0, seen: '' },
    triggers: [{ event: 'ui:model', ref: 'qty', do: [{ increment: 'changed' }, { set: 'seen', value: '{{@event.ref}}' }] }],
    layout: { component: 'Stack', children: { for: '$.lines', as: 'line', do: { component: 'Input', ref: 'qty', model: '$line.qty' } } },
  };

  it('writes what is typed into the row it was typed in, and the trigger on its ref still fires with that ref', async () => {
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { cart }, registry: registry() });
    const id = shell.push('main', 'cart');
    await later();
    const runtime = shell.getRuntime(id);
    const first = inputs(runtime?.render() ?? [])[0];
    expect(modelOf(first)).toEqual({ path: 'lines.0.qty', ref: 'qty@lines.0.qty' });
    expect(first?.type === 'component' ? first.ref : undefined).toBe('qty');
    shell.dispatch({ type: 'ui:model', ref: 'qty@lines.0.qty', origin: id, payload: 5 });
    await later();
    const data = runtime?.getData() ?? {};
    expect(data['lines']).toEqual([{ qty: 5 }, { qty: 1 }, { qty: 1 }]);
    expect(data['changed']).toBe(1);
    expect(data['seen']).toBe('qty');
  });

  it('a ui:model with the written ref still lands on the last row', async () => {
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { cart }, registry: registry() });
    const id = shell.push('main', 'cart');
    await later();
    const runtime = shell.getRuntime(id);
    runtime?.render();
    shell.dispatch({ type: 'ui:model', ref: 'qty', origin: id, payload: 9 });
    await later();
    expect(runtime?.getData()['lines']).toEqual([{ qty: 1 }, { qty: 1 }, { qty: 9 }]);
  });

  it('row 0 keeps its model ref when a second row appears', async () => {
    const one: ActionDefinition = { ...cart, data: { lines: [{ qty: 1 }] } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { cart: one }, registry: registry() });
    const id = shell.push('main', 'cart');
    await later();
    const runtime = shell.getRuntime(id);
    const before = modelOf(inputs(runtime?.render() ?? [])[0]);
    runtime?.setData({ ...runtime.getData(), lines: [{ qty: 1 }, { qty: 0 }] });
    expect(modelOf(inputs(runtime?.render() ?? [])[0])).toEqual(before);
  });

  it('a field with a ref bound to the root keeps its ref as its model ref', async () => {
    const form: ActionDefinition = { id: 'form', data: { q: '' }, layout: { component: 'Input', ref: 'q', model: '$.q' } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { form }, registry: registry() });
    const id = shell.push('main', 'form');
    await later();
    expect(modelOf(inputs(shell.getRuntime(id)?.render() ?? [])[0])).toEqual({ path: 'q', ref: 'q' });
  });
});
